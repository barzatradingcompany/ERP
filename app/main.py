import os

from authlib.integrations.starlette_client import OAuth
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import or_, select, text
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from app.database import Base, engine, get_db
from app import models, schemas
from app.services import operations

load_dotenv()
Base.metadata.create_all(bind=engine)

app = FastAPI(title="ERP V1", version="1.1.0")


def _ensure_products_category_column():
    with engine.begin() as conn:
        if engine.dialect.name == "sqlite":
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(products)")).fetchall()]
            if "category" not in cols:
                conn.execute(text("ALTER TABLE products ADD COLUMN category VARCHAR(100) DEFAULT ''"))
        else:
            conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT ''"))


_ensure_products_category_column()

session_secret = os.getenv("SESSION_SECRET", "change-this-session-secret")
app.add_middleware(SessionMiddleware, secret_key=session_secret, same_site="lax", https_only=False)
app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


def require_user(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Please login with Google")
    return user


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    user = request.session.get("user") or require_user(request)
    return templates.TemplateResponse("index.html", {"request": request, "user": user})


@app.get("/auth/login")
async def login(request: Request):
    if not os.getenv("GOOGLE_CLIENT_ID") or not os.getenv("GOOGLE_CLIENT_SECRET"):
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")
    redirect_uri = request.url_for("auth_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)


@app.get("/auth/callback")
async def auth_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    userinfo = token.get("userinfo")
    if not userinfo:
        userinfo = await oauth.google.userinfo(token=token)
    request.session["user"] = {
        "email": userinfo.get("email"),
        "name": userinfo.get("name"),
        "picture": userinfo.get("picture"),
    }
    return RedirectResponse(url="/", status_code=302)


@app.get("/auth/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=302)


@app.get("/me")
def me(user=Depends(require_user)):
    return user


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/customers")
def create_customer(payload: schemas.CustomerCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_customer(db, payload)


@app.get("/customers")
def list_customers(q: str | None = None, db: Session = Depends(get_db), _=Depends(require_user)):
    stmt = select(models.Customer)
    if q:
        token = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                models.Customer.store_name.ilike(token),
                models.Customer.phone.ilike(token),
                models.Customer.customer_type.ilike(token),
            )
        )
    return db.execute(stmt.order_by(models.Customer.id.desc())).scalars().all()


@app.post("/suppliers")
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_supplier(db, payload)


@app.get("/suppliers")
def list_suppliers(db: Session = Depends(get_db), _=Depends(require_user)):
    return db.execute(select(models.Supplier).order_by(models.Supplier.id.desc())).scalars().all()


@app.post("/products")
def create_product(payload: schemas.ProductCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_product(db, payload)


@app.get("/products")
def list_products(q: str | None = None, db: Session = Depends(get_db), _=Depends(require_user)):
    stmt = select(models.Product)
    if q:
        token = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                models.Product.name.ilike(token),
                models.Product.category.ilike(token),
                models.Product.size.ilike(token),
                models.Product.thickness.ilike(token),
            )
        )
    return db.execute(stmt.order_by(models.Product.id.desc())).scalars().all()


@app.put("/products/{product_id}")
def update_product(product_id: int, payload: schemas.ProductUpdate, db: Session = Depends(get_db), _=Depends(require_user)):
    row = db.get(models.Product, product_id)
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    data = payload.model_dump()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@app.get("/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db), _=Depends(require_user)):
    row = db.get(models.Product, product_id)
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    return row


@app.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), _=Depends(require_user)):
    row = db.get(models.Product, product_id)
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    if row.stock_qty > 0:
        raise HTTPException(status_code=400, detail="Cannot delete product with stock quantity > 0")
    purchase_refs = db.execute(select(models.PurchaseItem.id).where(models.PurchaseItem.product_id == product_id)).first()
    sale_refs = db.execute(select(models.SaleItem.id).where(models.SaleItem.product_id == product_id)).first()
    if purchase_refs or sale_refs:
        raise HTTPException(status_code=400, detail="Cannot delete product with transaction history")
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.post("/purchases")
def create_purchase(payload: schemas.PurchaseCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_purchase(db, payload)


@app.get("/purchases")
def list_purchases(db: Session = Depends(get_db), _=Depends(require_user)):
    return db.execute(select(models.Purchase).order_by(models.Purchase.id.desc())).scalars().all()


@app.post("/sales")
def create_sale(payload: schemas.SaleCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_sale(db, payload)


@app.get("/sales")
def list_sales(db: Session = Depends(get_db), _=Depends(require_user)):
    return db.execute(select(models.Sale).order_by(models.Sale.id.desc())).scalars().all()


@app.post("/returns/sales")
def create_sales_return(payload: schemas.SalesReturnCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_sales_return(db, payload)


@app.post("/returns/purchase")
def create_purchase_return(
    payload: schemas.PurchaseReturnCreate, db: Session = Depends(get_db), _=Depends(require_user)
):
    return operations.create_purchase_return(db, payload)


@app.post("/vouchers/receipt")
def create_receipt(payload: schemas.ReceiptVoucherCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_receipt_voucher(db, payload)


@app.post("/vouchers/payment")
def create_payment(payload: schemas.PaymentVoucherCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_payment_voucher(db, payload)


@app.get("/inventory")
def inventory(db: Session = Depends(get_db), _=Depends(require_user)):
    return {
        "summary": operations.inventory_summary(db),
        "items": db.execute(select(models.Product).order_by(models.Product.name.asc())).scalars().all(),
    }


@app.get("/daybook")
def daybook(limit: int = 200, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.daybook_list(db, limit=limit)


@app.get("/daybook/feed")
def daybook_feed(limit: int = 200, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.daybook_feed(db, limit=limit)


@app.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.dashboard(db)
