from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas


def _today_bounds_utc():
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).replace(tzinfo=None)
    end = datetime(now.year, now.month, now.day, 23, 59, 59, tzinfo=timezone.utc).replace(tzinfo=None)
    return start, end


def _month_start_utc():
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc).replace(tzinfo=None)


def add_daybook(
    db: Session,
    event_type: models.DaybookType,
    ref_table: str,
    ref_id: int,
    narration: str,
    sales_amount: float = 0.0,
    purchase_amount: float = 0.0,
    cash_in: float = 0.0,
    cash_out: float = 0.0,
):
    entry = models.DaybookEntry(
        event_type=event_type,
        ref_table=ref_table,
        ref_id=ref_id,
        narration=narration,
        sales_amount=sales_amount,
        purchase_amount=purchase_amount,
        cash_in=cash_in,
        cash_out=cash_out,
    )
    db.add(entry)


def create_customer(db: Session, payload: schemas.CustomerCreate):
    c = models.Customer(
        customer_type=payload.customer_type,
        store_name=payload.store_name,
        phone=payload.phone,
        address=payload.address,
        outstanding_balance=payload.opening_balance,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def create_supplier(db: Session, payload: schemas.SupplierCreate):
    s = models.Supplier(
        name=payload.name,
        phone=payload.phone,
        address=payload.address,
        outstanding_balance=payload.opening_balance,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def create_product(db: Session, payload: schemas.ProductCreate):
    p = models.Product(**payload.model_dump())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def create_purchase(db: Session, payload: schemas.PurchaseCreate):
    supplier = db.get(models.Supplier, payload.supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    total = sum(i.quantity * i.unit_cost for i in payload.items)
    purchase = models.Purchase(supplier_id=payload.supplier_id, total_amount=total)
    db.add(purchase)
    db.flush()

    for line in payload.items:
        product = db.get(models.Product, line.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {line.product_id} not found")
        product.stock_qty += line.quantity
        item = models.PurchaseItem(
            purchase_id=purchase.id,
            product_id=line.product_id,
            quantity=line.quantity,
            unit_cost=line.unit_cost,
        )
        db.add(item)

    supplier.outstanding_balance += total
    add_daybook(
        db,
        models.DaybookType.PURCHASE,
        "purchases",
        purchase.id,
        f"Purchased stock from supplier #{supplier.id}",
        purchase_amount=total,
    )

    db.commit()
    db.refresh(purchase)
    return purchase


def create_sale(db: Session, payload: schemas.SaleCreate):
    customer = db.get(models.Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    total = sum(i.quantity * i.unit_price for i in payload.items)
    paid = payload.paid_amount
    if payload.payment_type == models.PaymentType.FULL:
        paid = total
    if paid > total:
        raise HTTPException(status_code=400, detail="Paid amount cannot exceed invoice total")
    due = total - paid

    sale = models.Sale(
        customer_id=payload.customer_id,
        payment_type=payload.payment_type,
        total_amount=total,
        paid_amount=paid,
        due_amount=due,
    )
    db.add(sale)
    db.flush()

    for line in payload.items:
        product = db.get(models.Product, line.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {line.product_id} not found")
        if product.stock_qty < line.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for product {product.name}")
        product.stock_qty -= line.quantity
        db.add(
            models.SaleItem(
                sale_id=sale.id,
                product_id=line.product_id,
                quantity=line.quantity,
                unit_price=line.unit_price,
            )
        )

    customer.outstanding_balance += due
    add_daybook(
        db,
        models.DaybookType.SALE,
        "sales",
        sale.id,
        f"Sale invoice #{sale.id} for customer #{customer.id}",
        sales_amount=total,
        cash_in=paid,
    )

    db.commit()
    db.refresh(sale)
    return sale


def create_sales_return(db: Session, payload: schemas.SalesReturnCreate):
    customer = db.get(models.Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    total = sum(i.quantity * i.unit_price for i in payload.items)
    record = models.SalesReturn(
        customer_id=payload.customer_id,
        sale_id=payload.sale_id,
        total_amount=total,
    )
    db.add(record)
    db.flush()

    for line in payload.items:
        product = db.get(models.Product, line.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {line.product_id} not found")
        product.stock_qty += line.quantity
        db.add(
            models.SalesReturnItem(
                sales_return_id=record.id,
                product_id=line.product_id,
                quantity=line.quantity,
                unit_price=line.unit_price,
            )
        )

    customer.outstanding_balance = max(0.0, customer.outstanding_balance - total)
    add_daybook(
        db,
        models.DaybookType.SALE_RETURN,
        "sales_returns",
        record.id,
        f"Sales return #{record.id} from customer #{customer.id}",
        sales_amount=-total,
    )
    db.commit()
    db.refresh(record)
    return record


def create_purchase_return(db: Session, payload: schemas.PurchaseReturnCreate):
    supplier = db.get(models.Supplier, payload.supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    total = sum(i.quantity * i.unit_cost for i in payload.items)
    record = models.PurchaseReturn(
        supplier_id=payload.supplier_id,
        purchase_id=payload.purchase_id,
        total_amount=total,
    )
    db.add(record)
    db.flush()

    for line in payload.items:
        product = db.get(models.Product, line.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {line.product_id} not found")
        if product.stock_qty < line.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for product {product.name}")
        product.stock_qty -= line.quantity
        db.add(
            models.PurchaseReturnItem(
                purchase_return_id=record.id,
                product_id=line.product_id,
                quantity=line.quantity,
                unit_cost=line.unit_cost,
            )
        )

    supplier.outstanding_balance = max(0.0, supplier.outstanding_balance - total)
    add_daybook(
        db,
        models.DaybookType.PURCHASE_RETURN,
        "purchase_returns",
        record.id,
        f"Purchase return #{record.id} to supplier #{supplier.id}",
        purchase_amount=-total,
    )
    db.commit()
    db.refresh(record)
    return record


def create_receipt_voucher(db: Session, payload: schemas.ReceiptVoucherCreate):
    customer = db.get(models.Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    rv = models.ReceiptVoucher(**payload.model_dump())
    db.add(rv)
    db.flush()
    customer.outstanding_balance = max(0.0, customer.outstanding_balance - payload.amount)
    add_daybook(
        db,
        models.DaybookType.RECEIPT,
        "receipt_vouchers",
        rv.id,
        f"Receipt from customer #{customer.id}",
        cash_in=payload.amount,
    )
    db.commit()
    db.refresh(rv)
    return rv


def create_payment_voucher(db: Session, payload: schemas.PaymentVoucherCreate):
    pv = models.PaymentVoucher(**payload.model_dump())
    if payload.category == models.VoucherCategory.SUPPLIER:
        if not payload.supplier_id:
            raise HTTPException(status_code=400, detail="supplier_id is required for supplier payment")
        supplier = db.get(models.Supplier, payload.supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        supplier.outstanding_balance = max(0.0, supplier.outstanding_balance - payload.amount)
    db.add(pv)
    db.flush()
    add_daybook(
        db,
        models.DaybookType.PAYMENT,
        "payment_vouchers",
        pv.id,
        f"Payment voucher #{pv.id} ({payload.category.value})",
        cash_out=payload.amount,
    )
    db.commit()
    db.refresh(pv)
    return pv


def dashboard(db: Session):
    start_today, end_today = _today_bounds_utc()
    start_month = _month_start_utc()

    todays_sales = db.scalar(
        select(func.coalesce(func.sum(models.Sale.total_amount), 0.0)).where(
            models.Sale.created_at >= start_today, models.Sale.created_at <= end_today
        )
    )
    monthly_sales = db.scalar(
        select(func.coalesce(func.sum(models.Sale.total_amount), 0.0)).where(models.Sale.created_at >= start_month)
    )
    outstanding_customers = db.scalar(select(func.coalesce(func.sum(models.Customer.outstanding_balance), 0.0)))
    stock_value = db.scalar(
        select(func.coalesce(func.sum(models.Product.stock_qty * models.Product.purchase_cost), 0.0))
    )
    cash_received_today = db.scalar(
        select(func.coalesce(func.sum(models.DaybookEntry.cash_in), 0.0)).where(
            models.DaybookEntry.created_at >= start_today, models.DaybookEntry.created_at <= end_today
        )
    )
    cash_paid_today = db.scalar(
        select(func.coalesce(func.sum(models.DaybookEntry.cash_out), 0.0)).where(
            models.DaybookEntry.created_at >= start_today, models.DaybookEntry.created_at <= end_today
        )
    )
    low_stock_alerts = db.scalar(
        select(func.count(models.Product.id)).where(models.Product.stock_qty <= models.Product.low_stock_limit)
    )
    return schemas.DashboardOut(
        todays_sales=todays_sales or 0.0,
        monthly_sales=monthly_sales or 0.0,
        outstanding_customer_balances=outstanding_customers or 0.0,
        stock_value=stock_value or 0.0,
        cash_received_today=cash_received_today or 0.0,
        cash_paid_today=cash_paid_today or 0.0,
        low_stock_alerts=low_stock_alerts or 0,
    )


def inventory_summary(db: Session):
    stock_value = db.scalar(
        select(func.coalesce(func.sum(models.Product.stock_qty * models.Product.purchase_cost), 0.0))
    )
    low_stock_count = db.scalar(
        select(func.count(models.Product.id)).where(models.Product.stock_qty <= models.Product.low_stock_limit)
    )
    total_products = db.scalar(select(func.count(models.Product.id)))
    return schemas.InventorySummary(
        stock_value=stock_value or 0.0,
        low_stock_count=low_stock_count or 0,
        total_products=total_products or 0,
    )


def daybook_list(db: Session, limit: int = 200):
    rows = db.execute(
        select(models.DaybookEntry).order_by(models.DaybookEntry.created_at.desc()).limit(limit)
    ).scalars().all()
    return [
        schemas.DaybookOut(
            id=r.id,
            event_type=r.event_type.value,
            narration=r.narration,
            sales_amount=r.sales_amount,
            purchase_amount=r.purchase_amount,
            cash_in=r.cash_in,
            cash_out=r.cash_out,
            created_at=r.created_at,
        )
        for r in rows
    ]
