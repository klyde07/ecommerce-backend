const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express(); // Ajoute cette ligne si absente
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

// Route GET /products
app.get('/products', async (req, res) => {
  const { category, size } = req.query;
  let query = supabase
    .from('products')
    .select(`
      id,
      name,
      base_price,
      category_id,
      product_variants (
        id,
        product_id,
        size,
        stock_quantity,
        price
      )
    `)
    .eq('is_active', true); // Filtre actif
  if (category) query = query.eq('category_id', category);
  if (size) query = query.eq('product_variants.size', size);
  const { data, error } = await query;
  console.log('Supabase data:', data); // Ajoute pour déboguer
  console.log('Supabase error:', error); // Ajoute pour voir les erreurs
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});
// Autres routes (POST /products, PUT, DELETE, auth) restent ici comme avant...

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server sur port ${PORT}`));
