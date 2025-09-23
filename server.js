const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cors = require('cors');

app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Supabase connection
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requis' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    req.user = user;
    next();
  });
};

// Endpoint public pour produits
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Inscription
app.post('/auth/signup', async (req, res) => {
  const { email, password, first_name, last_name } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, password, first_name, last_name] // Simplifié : hash le password si besoin
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token });
  } catch (err) {
    res.status(400).json({ error: 'Email déjà utilisé' });
  }
});

// Connexion
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND password = $2', [email, password]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter au panier
app.post('/shopping-carts', authenticateToken, async (req, res) => {
  const { product_id, quantity } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO shopping_carts (user_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, product_id, quantity]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur ajout panier' });
  }
});

// Passer commande
app.post('/orders', authenticateToken, async (req, res) => {
  const { items } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO orders (user_id, status) VALUES ($1, $2) RETURNING *',
      [req.user.id, 'pending']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur commande' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur démarré sur port ${PORT}`));
