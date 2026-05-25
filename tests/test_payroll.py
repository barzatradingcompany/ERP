import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.services import operations


class PayrollTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def create_employee(self, active=True):
        employee = models.Employee(
            name="Staff One",
            role="Helper",
            monthly_salary=12000.0,
            active=active,
        )
        self.db.add(employee)
        self.db.commit()
        self.db.refresh(employee)
        return employee

    def test_salary_payment_creates_cash_out_daybook_entry(self):
        employee = self.create_employee()
        payload = schemas.SalaryPaymentCreate(
            employee_id=employee.id,
            amount=12000.0,
            payment_month="2026-05",
        )

        payment = operations.create_salary_payment(self.db, payload)

        self.assertEqual(payment.amount, 12000.0)
        self.assertEqual(payment.payment_month, "2026-05")
        entry = self.db.query(models.DaybookEntry).one()
        self.assertEqual(entry.ref_table, "salary_payments")
        self.assertEqual(entry.ref_id, payment.id)
        self.assertEqual(entry.cash_out, 12000.0)

    def test_inactive_employee_cannot_be_paid(self):
        employee = self.create_employee(active=False)
        payload = schemas.SalaryPaymentCreate(employee_id=employee.id, amount=1000.0)

        with self.assertRaises(HTTPException) as error:
            operations.create_salary_payment(self.db, payload)

        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(self.db.query(models.SalaryPayment).count(), 0)
        self.assertEqual(self.db.query(models.DaybookEntry).count(), 0)


if __name__ == "__main__":
    unittest.main()
