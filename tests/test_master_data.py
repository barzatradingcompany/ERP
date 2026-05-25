import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main, models
from app.database import Base


class MasterDataApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.Session()

        def override_db():
            yield self.db

        main.app.dependency_overrides[main.get_db] = override_db
        main.app.dependency_overrides[main.require_user] = lambda: {"email": "test@example.com"}
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_customer_can_be_updated(self):
        customer = models.Customer(
            customer_type=models.CustomerType.RETAIL,
            store_name="Old Store",
            phone="111",
            outstanding_balance=25.0,
        )
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)

        response = self.client.put(
            f"/customers/{customer.id}",
            json={
                "customer_type": "wholesale",
                "store_name": "Updated Store",
                "phone": "222",
                "address": "Market Road",
                "outstanding_balance": 40.0,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.db.refresh(customer)
        self.assertEqual(customer.customer_type, models.CustomerType.WHOLESALE)
        self.assertEqual(customer.store_name, "Updated Store")
        self.assertEqual(customer.outstanding_balance, 40.0)

    def test_supplier_can_be_updated_and_searched(self):
        supplier = models.Supplier(name="Foam Source", phone="555", outstanding_balance=100.0)
        self.db.add(supplier)
        self.db.commit()
        self.db.refresh(supplier)

        response = self.client.put(
            f"/suppliers/{supplier.id}",
            json={
                "name": "Foam Source Co",
                "phone": "777",
                "address": "Industrial Area",
                "outstanding_balance": 75.0,
            },
        )
        search = self.client.get("/suppliers?q=Source")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(search.status_code, 200)
        self.assertEqual(len(search.json()), 1)
        self.db.refresh(supplier)
        self.assertEqual(supplier.name, "Foam Source Co")
        self.assertEqual(supplier.outstanding_balance, 75.0)

    def test_product_cannot_be_its_own_parent(self):
        product = models.Product(
            name="Mattress",
            purchase_cost=1000.0,
            selling_price=1500.0,
            stock_qty=3,
            low_stock_limit=1,
        )
        self.db.add(product)
        self.db.commit()
        self.db.refresh(product)

        response = self.client.put(
            f"/products/{product.id}",
            json={
                "parent_id": product.id,
                "name": "Mattress",
                "category": "",
                "size": "",
                "thickness": "",
                "purchase_cost": 1000.0,
                "selling_price": 1500.0,
                "stock_qty": 3,
                "low_stock_limit": 1,
            },
        )

        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
