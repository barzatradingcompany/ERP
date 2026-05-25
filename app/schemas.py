from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models import CustomerType, PaymentType, VoucherCategory


class CustomerCreate(BaseModel):
    customer_type: CustomerType
    store_name: str = Field(min_length=1)
    phone: str = ""
    address: str = ""
    opening_balance: float = Field(default=0.0, ge=0)


class CustomerUpdate(BaseModel):
    customer_type: CustomerType
    store_name: str = Field(min_length=1)
    phone: str = ""
    address: str = ""
    outstanding_balance: float = Field(default=0.0, ge=0)


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1)
    phone: str = ""
    address: str = ""
    opening_balance: float = Field(default=0.0, ge=0)


class SupplierUpdate(BaseModel):
    name: str = Field(min_length=1)
    phone: str = ""
    address: str = ""
    outstanding_balance: float = Field(default=0.0, ge=0)


class ProductCreate(BaseModel):
    parent_id: int | None = None
    name: str = Field(min_length=1)
    category: str = ""
    size: str = ""
    thickness: str = ""
    purchase_cost: float = Field(ge=0)
    selling_price: float = Field(ge=0)
    stock_qty: int = Field(default=0, ge=0)
    low_stock_limit: int = Field(default=5, ge=0)


class ProductUpdate(BaseModel):
    parent_id: int | None = None
    name: str = Field(min_length=1)
    category: str = ""
    size: str = ""
    thickness: str = ""
    purchase_cost: float = Field(ge=0)
    selling_price: float = Field(ge=0)
    stock_qty: int = Field(default=0, ge=0)
    low_stock_limit: int = Field(default=5, ge=0)


class EmployeeCreate(BaseModel):
    name: str = Field(min_length=1)
    role: str = ""
    phone: str = ""
    address: str = ""
    monthly_salary: float = Field(default=0.0, ge=0)
    active: bool = True


class EmployeeUpdate(BaseModel):
    name: str = Field(min_length=1)
    role: str = ""
    phone: str = ""
    address: str = ""
    monthly_salary: float = Field(default=0.0, ge=0)
    active: bool = True


class SalaryPaymentCreate(BaseModel):
    employee_id: int
    amount: float = Field(gt=0)
    payment_month: str = ""
    payment_date: date | None = None
    notes: str = ""


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
    items: list[PurchaseItemIn] = Field(min_length=1)


class SaleItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: float = Field(gt=0)


class SaleCreate(BaseModel):
    customer_id: int
    payment_type: PaymentType
    sale_date: date | None = None
    paid_amount: float = 0.0
    items: list[SaleItemIn] = Field(min_length=1)


class SalesReturnCreate(BaseModel):
    customer_id: int
    sale_id: int | None = None
    items: list[SaleItemIn] = Field(min_length=1)


class PurchaseReturnItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0)
    unit_cost: float = Field(gt=0)


class PurchaseReturnCreate(BaseModel):
    supplier_id: int
    purchase_id: int | None = None
    items: list[PurchaseReturnItemIn] = Field(min_length=1)


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
