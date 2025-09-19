const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware auth (vérifie JWT et rôle)
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requis' });
  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
    req.user = { id: user.id, role: userData.role };
    next();
  });
};

const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Rôle insuffisant' });
  next();
};

// Routes CRUD produits (exemple pour stocks réalistes)
// GET /products (tous, avec filtres tailles/catégories)
app.get('/products', async (req, res) => {
  const { category, size } = req.query;
  let query = supabase.from('products').select(`
    *,
    product_variants (
      id,
      size,
      stock_quantity,
      price
    )
  `);
  if (category) query = query.eq('category_id', category);
  if (size) query = query.eq('product_variants.size', size);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /products (admin only, crée produit + variantes tailles)
app.post('/products', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, description, base_price, category_id, variants } = req.body; // variants: array {size, stock_quantity}
  const { data, error } = await supabase.from('products').insert({ name, description, base_price, category_id }).select().single();
  if (error) return res.status(500).json({ error });
  // Insère variantes
  for (let v of variants) {
    await supabase.from('product_variants').insert({ product_id: data.id, ...v });
  }
  res.json(data);
});

// PUT /products/:id (update stock, vendeur/admin)
app.put('/products/:id', authenticateToken, requireRole(['admin', 'vendeur']), async (req, res) => {
  const { id } = req.params;
  const { stock_quantity } = req.body; // Update variante stock
  const { error } = await supabase.from('product_variants').update({ stock_quantity }).eq('product_id', id).eq('size', req.body.size);
  if (error) return res.status(500).json({ error });
  res.json({ message: 'Stock mis à jour' });
});

// DELETE /products/:id (admin only)
app.delete('/products/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ message: 'Produit supprimé' });
});

// Auth routes (inscription/connexion avec rôles)
app.post('/auth/signup', async (req, res) => {
  const { email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const { data, error } = await supabase.from('users').insert({ email, password_hash: hashedPassword, role }).select().single();
  if (error) return res.status(400).json({ error });
  const token = jwt.sign({ id: data.id }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
  if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, role: user.role });
});

// Autres routes : commandes (CRUD pour vendeur/client), etc. (ajoute similairement)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server sur port ${PORT}`));
