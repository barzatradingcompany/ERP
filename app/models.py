from datetime import datetime
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CustomerType(str, PyEnum):
    RETAIL = "retail"
    WHOLESALE = "wholesale"


class PaymentType(str, PyEnum):
    FULL = "full"
    ADVANCE = "advance"
    CREDIT = "credit"


class VoucherCategory(str, PyEnum):
    SUPPLIER = "supplier"
    SALARY = "salary"
    EXPENSE = "expense"
    RENT = "rent"
    MISC = "misc"


class DaybookType(str, PyEnum):
    PURCHASE = "purchase"
    SALE = "sale"
    SALE_RETURN = "sale_return"
    PURCHASE_RETURN = "purchase_return"
    RECEIPT = "receipt"
    PAYMENT = "payment"


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_type: Mapped[CustomerType] = mapped_column(Enum(CustomerType), nullable=False)
    store_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    outstanding_balance: Mapped[float] = mapped_column(Float, default=0.0)


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), default="")
    address: Mapped[str] = mapped_column(Text, default="")
    outstanding_balance: Mapped[float] = mapped_column(Float, default=0.0)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    size: Mapped[str] = mapped_column(String(100), default="")
    thickness: Mapped[str] = mapped_column(String(100), default="")
    purchase_cost: Mapped[float] = mapped_column(Float, nullable=False)
    selling_price: Mapped[float] = mapped_column(Float, nullable=False)
    stock_qty: Mapped[int] = mapped_column(Integer, default=0)
    low_stock_limit: Mapped[int] = mapped_column(Integer, default=5)


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    supplier = relationship("Supplier")
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Float, nullable=False)

    purchase = relationship("Purchase", back_populates="items")
    product = relationship("Product")


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    payment_type: Mapped[PaymentType] = mapped_column(Enum(PaymentType), nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    due_amount: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    customer = relationship("Customer")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)

    sale = relationship("Sale", back_populates="items")
    product = relationship("Product")


class SalesReturn(Base):
    __tablename__ = "sales_returns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    items = relationship("SalesReturnItem", back_populates="sales_return", cascade="all, delete-orphan")


class SalesReturnItem(Base):
    __tablename__ = "sales_return_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sales_return_id: Mapped[int] = mapped_column(ForeignKey("sales_returns.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)

    sales_return = relationship("SalesReturn", back_populates="items")


class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    purchase_id: Mapped[int | None] = mapped_column(ForeignKey("purchases.id"), nullable=True)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    items = relationship("PurchaseReturnItem", back_populates="purchase_return", cascade="all, delete-orphan")


class PurchaseReturnItem(Base):
    __tablename__ = "purchase_return_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    purchase_return_id: Mapped[int] = mapped_column(ForeignKey("purchase_returns.id"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[float] = mapped_column(Float, nullable=False)

    purchase_return = relationship("PurchaseReturn", back_populates="items")


class ReceiptVoucher(Base):
    __tablename__ = "receipt_vouchers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class PaymentVoucher(Base):
    __tablename__ = "payment_vouchers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    category: Mapped[VoucherCategory] = mapped_column(Enum(VoucherCategory), nullable=False)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class DaybookEntry(Base):
    __tablename__ = "daybook_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    event_type: Mapped[DaybookType] = mapped_column(Enum(DaybookType), nullable=False)
    ref_table: Mapped[str] = mapped_column(String(100), nullable=False)
    ref_id: Mapped[int] = mapped_column(Integer, nullable=False)
    narration: Mapped[str] = mapped_column(String(255), default="")
    sales_amount: Mapped[float] = mapped_column(Float, default=0.0)
    purchase_amount: Mapped[float] = mapped_column(Float, default=0.0)
    cash_in: Mapped[float] = mapped_column(Float, default=0.0)
    cash_out: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
