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
            if "parent_id" not in cols:
                conn.execute(text("ALTER TABLE products ADD COLUMN parent_id INTEGER"))
        else:
            conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT ''"))
            conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS parent_id INTEGER NULL"))


_ensure_products_category_column()

session_secret = os.getenv("SESSION_SECRET", "change-this-session-secret")
session_cookie_secure = os.getenv("SESSION_COOKIE_SECURE", "false").lower() in {"1", "true", "yes", "on"}
app.add_middleware(SessionMiddleware, secret_key=session_secret, same_site="lax", https_only=session_cookie_secure)
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


@app.put("/customers/{customer_id}")
def update_customer(
    customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db), _=Depends(require_user)
):
    return operations.update_customer(db, customer_id, payload)


@app.post("/suppliers")
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_supplier(db, payload)


@app.get("/suppliers")
def list_suppliers(q: str | None = None, db: Session = Depends(get_db), _=Depends(require_user)):
    stmt = select(models.Supplier)
    if q:
        token = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                models.Supplier.name.ilike(token),
                models.Supplier.phone.ilike(token),
                models.Supplier.address.ilike(token),
            )
        )
    return db.execute(stmt.order_by(models.Supplier.id.desc())).scalars().all()


@app.put("/suppliers/{supplier_id}")
def update_supplier(
    supplier_id: int, payload: schemas.SupplierUpdate, db: Session = Depends(get_db), _=Depends(require_user)
):
    return operations.update_supplier(db, supplier_id, payload)


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
    if payload.parent_id == product_id:
        raise HTTPException(status_code=400, detail="Product cannot be its own parent")
    if payload.parent_id is not None and not db.get(models.Product, payload.parent_id):
        raise HTTPException(status_code=404, detail="Parent product not found")
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


@app.post("/employees")
def create_employee(payload: schemas.EmployeeCreate, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.create_employee(db, payload)


@app.get("/employees")
def list_employees(q: str | None = None, db: Session = Depends(get_db), _=Depends(require_user)):
    stmt = select(models.Employee)
    if q:
        token = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                models.Employee.name.ilike(token),
                models.Employee.role.ilike(token),
                models.Employee.phone.ilike(token),
            )
        )
    return db.execute(stmt.order_by(models.Employee.active.desc(), models.Employee.name.asc())).scalars().all()


@app.put("/employees/{employee_id}")
def update_employee(
    employee_id: int, payload: schemas.EmployeeUpdate, db: Session = Depends(get_db), _=Depends(require_user)
):
    return operations.update_employee(db, employee_id, payload)


@app.delete("/employees/{employee_id}")
def delete_employee(employee_id: int, db: Session = Depends(get_db), _=Depends(require_user)):
    row = db.get(models.Employee, employee_id)
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")
    row.active = False
    db.commit()
    return {"ok": True}


@app.get("/payroll/summary")
def payroll_summary(db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.payroll_summary(db)


@app.post("/payroll/payments")
def create_salary_payment(
    payload: schemas.SalaryPaymentCreate, db: Session = Depends(get_db), _=Depends(require_user)
):
    return operations.create_salary_payment(db, payload)


@app.get("/payroll/payments")
def list_salary_payments(limit: int = 50, db: Session = Depends(get_db), _=Depends(require_user)):
    return operations.salary_payment_list(db, limit=limit)


@app.delete("/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), _=Depends(require_user)):
    row = db.get(models.Product, product_id)
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    db.query(models.SaleItem).filter(models.SaleItem.product_id == product_id).delete()
    db.query(models.PurchaseItem).filter(models.PurchaseItem.product_id == product_id).delete()
    db.query(models.SalesReturnItem).filter(models.SalesReturnItem.product_id == product_id).delete()
    db.query(models.PurchaseReturnItem).filter(models.PurchaseReturnItem.product_id == product_id).delete()
    db.query(models.Product).filter(models.Product.parent_id == product_id).update({models.Product.parent_id: None})
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.delete("/customers/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db), _=Depends(require_user)):
    row = db.get(models.Customer, customer_id)
    if not row:
        raise HTTPException(status_code=404, detail="Customer not found")
    sale_ids = [x[0] for x in db.execute(select(models.Sale.id).where(models.Sale.customer_id == customer_id)).all()]
    if sale_ids:
        db.query(models.SaleItem).filter(models.SaleItem.sale_id.in_(sale_ids)).delete(synchronize_session=False)
        db.query(models.ReceiptVoucher).filter(models.ReceiptVoucher.sale_id.in_(sale_ids)).delete(synchronize_session=False)
        db.query(models.Sale).filter(models.Sale.id.in_(sale_ids)).delete(synchronize_session=False)
    db.query(models.ReceiptVoucher).filter(models.ReceiptVoucher.customer_id == customer_id).delete()
    sr_ids = [x[0] for x in db.execute(select(models.SalesReturn.id).where(models.SalesReturn.customer_id == customer_id)).all()]
    if sr_ids:
        db.query(models.SalesReturnItem).filter(models.SalesReturnItem.sales_return_id.in_(sr_ids)).delete(
            synchronize_session=False
        )
        db.query(models.SalesReturn).filter(models.SalesReturn.id.in_(sr_ids)).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.delete("/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), _=Depends(require_user)):
    row = db.get(models.Supplier, supplier_id)
    if not row:
        raise HTTPException(status_code=404, detail="Supplier not found")
    purchase_ids = [x[0] for x in db.execute(select(models.Purchase.id).where(models.Purchase.supplier_id == supplier_id)).all()]
    if purchase_ids:
        db.query(models.PurchaseItem).filter(models.PurchaseItem.purchase_id.in_(purchase_ids)).delete(synchronize_session=False)
        db.query(models.Purchase).filter(models.Purchase.id.in_(purchase_ids)).delete(synchronize_session=False)
    db.query(models.PaymentVoucher).filter(models.PaymentVoucher.supplier_id == supplier_id).delete()
    pr_ids = [x[0] for x in db.execute(select(models.PurchaseReturn.id).where(models.PurchaseReturn.supplier_id == supplier_id)).all()]
    if pr_ids:
        db.query(models.PurchaseReturnItem).filter(models.PurchaseReturnItem.purchase_return_id.in_(pr_ids)).delete(
            synchronize_session=False
        )
        db.query(models.PurchaseReturn).filter(models.PurchaseReturn.id.in_(pr_ids)).delete(synchronize_session=False)
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


@app.get("/transactions/recent")
def recent_transactions(limit: int = 5, db: Session = Depends(get_db), _=Depends(require_user)):
    rows = db.execute(select(models.DaybookEntry).order_by(models.DaybookEntry.created_at.desc()).limit(limit)).scalars().all()
    data = []
    for r in rows:
        amount = r.cash_in if r.cash_in else (r.cash_out if r.cash_out else (r.sales_amount if r.sales_amount else r.purchase_amount))
        customer = "-"
        if r.ref_table == "sales":
            sale = db.get(models.Sale, r.ref_id)
            if sale:
                c = db.get(models.Customer, sale.customer_id)
                customer = c.store_name if c else "-"
        data.append(
            {
                "type": r.event_type.value,
                "customer": customer,
                "amount": amount,
                "date": r.created_at.isoformat(),
            }
        )
    return data
