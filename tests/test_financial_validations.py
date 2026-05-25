import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.services import operations


class TransactionItemValidationTests(unittest.TestCase):
    def assert_empty_items_rejected(self, schema, payload):
        with self.assertRaises(ValidationError):
            schema(**payload)

    def test_sales_and_purchases_require_at_least_one_item(self):
        self.assert_empty_items_rejected(
            schemas.SaleCreate,
            {"customer_id": 1, "payment_type": models.PaymentType.CREDIT, "items": []},
        )
        self.assert_empty_items_rejected(
            schemas.PurchaseCreate,
            {"supplier_id": 1, "items": []},
        )

    def test_returns_require_at_least_one_item(self):
        self.assert_empty_items_rejected(
            schemas.SalesReturnCreate,
            {"customer_id": 1, "items": []},
        )
        self.assert_empty_items_rejected(
            schemas.PurchaseReturnCreate,
            {"supplier_id": 1, "items": []},
        )


class ReceiptVoucherValidationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def create_customer_with_sale(self):
        customer = models.Customer(
            customer_type=models.CustomerType.RETAIL,
            store_name="Test Store",
            outstanding_balance=80.0,
        )
        self.db.add(customer)
        self.db.flush()

        sale = models.Sale(
            customer_id=customer.id,
            payment_type=models.PaymentType.CREDIT,
            total_amount=100.0,
            paid_amount=20.0,
            due_amount=80.0,
        )
        self.db.add(sale)
        self.db.commit()
        self.db.refresh(customer)
        self.db.refresh(sale)
        return customer, sale

    def test_receipt_cannot_exceed_sale_due_amount(self):
        customer, sale = self.create_customer_with_sale()
        payload = schemas.ReceiptVoucherCreate(
            customer_id=customer.id,
            sale_id=sale.id,
            amount=81.0,
        )

        with self.assertRaises(HTTPException) as error:
            operations.create_receipt_voucher(self.db, payload)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.db.query(models.ReceiptVoucher).count(), 0)
        self.db.refresh(sale)
        self.assertEqual(sale.paid_amount, 20.0)
        self.assertEqual(sale.due_amount, 80.0)

    def test_receipt_sale_must_belong_to_customer(self):
        customer, sale = self.create_customer_with_sale()
        other_customer = models.Customer(
            customer_type=models.CustomerType.RETAIL,
            store_name="Other Store",
            outstanding_balance=0.0,
        )
        self.db.add(other_customer)
        self.db.commit()
        self.db.refresh(other_customer)

        payload = schemas.ReceiptVoucherCreate(
            customer_id=other_customer.id,
            sale_id=sale.id,
            amount=10.0,
        )

        with self.assertRaises(HTTPException) as error:
            operations.create_receipt_voucher(self.db, payload)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.db.query(models.ReceiptVoucher).count(), 0)
        self.db.refresh(customer)
        self.assertEqual(customer.outstanding_balance, 80.0)

    def test_valid_receipt_updates_sale_and_customer_balance(self):
        customer, sale = self.create_customer_with_sale()
        payload = schemas.ReceiptVoucherCreate(
            customer_id=customer.id,
            sale_id=sale.id,
            amount=80.0,
        )

        receipt = operations.create_receipt_voucher(self.db, payload)

        self.db.refresh(customer)
        self.db.refresh(sale)
        self.assertEqual(receipt.amount, 80.0)
        self.assertEqual(sale.paid_amount, 100.0)
        self.assertEqual(sale.due_amount, 0.0)
        self.assertEqual(customer.outstanding_balance, 0.0)
        self.assertEqual(self.db.query(models.DaybookEntry).count(), 1)


if __name__ == "__main__":
    unittest.main()
