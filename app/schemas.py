from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models import CustomerType, PaymentType, VoucherCategory


class CustomerCreate(BaseModel):
    customer_type: CustomerType
    store_name: str
    phone: str = ""
    address: str = ""
    opening_balance: float = 0.0


class SupplierCreate(BaseModel):
    name: str
    phone: str = ""
    address: str = ""
    opening_balance: float = 0.0


class ProductCreate(BaseModel):
    name: str
    category: str = ""
    size: str = ""
    thickness: str = ""
    purchase_cost: float
    selling_price: float
    stock_qty: int = 0
    low_stock_limit: int = 5


class ProductUpdate(BaseModel):
    name: str
    category: str = ""
    size: str = ""
    thickness: str = ""
    purchase_cost: float
    selling_price: float
    stock_qty: int = 0
    low_stock_limit: int = 5


class ProductQtyLine(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: float = Field(gt=0)


class PurchaseItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_cost: float = Field(gt=0)


class PurchaseCreate(BaseModel):
    supplier_id: int
    purchase_date: date | None = None
    items: list[PurchaseItemIn]


class SaleItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: float = Field(gt=0)


class SaleCreate(BaseModel):
    customer_id: int
    payment_type: PaymentType
    sale_date: date | None = None
    paid_amount: float = 0.0
    items: list[SaleItemIn]


class SalesReturnCreate(BaseModel):
    customer_id: int
    sale_id: int | None = None
    items: list[SaleItemIn]


class PurchaseReturnItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_cost: float = Field(gt=0)


class PurchaseReturnCreate(BaseModel):
    supplier_id: int
    purchase_id: int | None = None
    items: list[PurchaseReturnItemIn]


class ReceiptVoucherCreate(BaseModel):
    customer_id: int
    sale_id: int | None = None
    amount: float = Field(gt=0)
    notes: str = ""


class PaymentVoucherCreate(BaseModel):
    category: VoucherCategory
    supplier_id: int | None = None
    amount: float = Field(gt=0)
    notes: str = ""


class InventorySummary(BaseModel):
    stock_value: float
    low_stock_count: int
    total_products: int


class DaybookOut(BaseModel):
    id: int
    event_type: str
    narration: str
    sales_amount: float
    purchase_amount: float
    cash_in: float
    cash_out: float
    created_at: datetime


class DashboardOut(BaseModel):
    todays_sales: float
    monthly_sales: float
    outstanding_customer_balances: float
    stock_value: float
    cash_received_today: float
    cash_paid_today: float
    low_stock_alerts: int
