import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();
const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// ----------------------- //
// --- TEST ROUTE --- //
// ----------------------- //
app.get("/", (req, res) => {
  res.json({ message: "API WebDigi5 running 🚀" });
});


// ----------------------- //
// --- PRODUCTS CRUD --- //
// ----------------------- //

// Get all products
app.get("/products", async (req, res) => {
  try {
    const products = await prisma.products.findMany({
      include: {
        product_images: true,
        product_variants: true,
      },
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get product by ID
app.get("/products/:id", async (req, res) => {
  try {
    const product = await prisma.products.findUnique({
      where: { id: req.params.id },
      include: {
        product_images: true,
        product_variants: true,
      },
    });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product
app.post("/products", async (req, res) => {
  try {
    const { name, description, base_price, sku, brand_id, category_id } = req.body;
    const product = await prisma.products.create({
      data: { name, description, base_price, sku, brand_id, category_id },
    });
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product
app.put("/products/:id", async (req, res) => {
  try {
    const { name, description, base_price, is_active } = req.body;
    const product = await prisma.products.update({
      where: { id: req.params.id },
      data: { name, description, base_price, is_active },
    });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product
app.delete("/products/:id", async (req, res) => {
  try {
    await prisma.products.delete({ where: { id: req.params.id } });
    res.json({ message: "Product deleted ✅" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ----------------------- //
// --- USERS CRUD --- //
// ----------------------- //

// Get all users
app.get("/users", async (req, res) => {
  try {
    const users = await prisma.users.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID
app.get("/users/:id", async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.params.id },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create user
app.post("/users", async (req, res) => {
  try {
    const { email, password_hash, first_name, last_name, role } = req.body;
    const user = await prisma.users.create({
      data: { email, password_hash, first_name, last_name, role },
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user
app.put("/users/:id", async (req, res) => {
  try {
    const { first_name, last_name, role, is_active } = req.body;
    const user = await prisma.users.update({
      where: { id: req.params.id },
      data: { first_name, last_name, role, is_active },
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
app.delete("/users/:id", async (req, res) => {
  try {
    await prisma.users.delete({ where: { id: req.params.id } });
    res.json({ message: "User deleted ✅" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ----------------------- //
// --- ORDERS CRUD --- //
// ----------------------- //

// Get all orders
app.get("/orders", async (req, res) => {
  try {
    const orders = await prisma.orders.findMany({
      include: { order_items: true, users: true },
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order by ID
app.get("/orders/:id", async (req, res) => {
  try {
    const order = await prisma.orders.findUnique({
      where: { id: req.params.id },
      include: { order_items: true, users: true },
    });
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order
app.post("/orders", async (req, res) => {
  try {
    const { user_id, total_amount, shipping_address, billing_address, payment_method } = req.body;
    const order = await prisma.orders.create({
      data: {
        user_id,
        total_amount,
        shipping_address,
        billing_address,
        payment_method,
        status: "pending",
        payment_status: "pending",
      },
    });
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order
app.put("/orders/:id", async (req, res) => {
  try {
    const { status, payment_status } = req.body;
    const order = await prisma.orders.update({
      where: { id: req.params.id },
      data: { status, payment_status },
    });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete order
app.delete("/orders/:id", async (req, res) => {
  try {
    await prisma.orders.delete({ where: { id: req.params.id } });
    res.json({ message: "Order deleted ✅" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ----------------------- //
// --- START SERVER --- //
// ----------------------- //
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
