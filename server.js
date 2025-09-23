const express = require('express');
const app = express();
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const cors = require('cors');

app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Doit être défini via Railway
});

// Route par défaut
app.get('/', (req, res) => {
  res.send('Backend e-commerce opérationnel. Utilisez les API /products, /auth/signup, etc.');
});

// Endpoint public pour produits
app.get('/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products'); // Ajuste selon ta table Supabase
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur produits:', err.stack); // Log l'erreur pour debug
    res.status(500).json({ error: 'Erreur serveur lors du chargement des produits' });
  }
});

// Inscription
app.post('/auth/signup', async (req, res) => {
  const { email, password, first_name, last_name } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (email, password, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, password, first_name, last_name]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
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
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Ajouter au panier
app.post('/shopping-carts', async (req, res) => {
  const { product_id, quantity } = req.body;
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requis' });
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    pool.query(
      'INSERT INTO shopping_carts (user_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *',
      [user.id, product_id, quantity],
      (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur ajout panier' });
        res.json(result.rows[0]);
      }
    );
  });
});

// Passer commande
app.post('/orders', async (req, res) => {
  const { items } = req.body;
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requis' });
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(503).json({ error: 'Token invalide' });
    pool.query(
      'INSERT INTO orders (user_id, status) VALUES ($1, $2) RETURNING *',
      [user.id, 'pending'],
      (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur commande' });
        res.json(result.rows[0]);
      }
    );
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur démarré sur port ${PORT}`));
