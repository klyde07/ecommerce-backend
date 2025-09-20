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

// Route racine (pour éviter "Cannot GET /")
app.get('/', (req, res) => res.send('API e-commerce en cours...'));

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
    .eq('is_active', true);
  if (category) query = query.eq('category_id', category);
  if (size) query = query.eq('product_variants.size', size);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Route POST /products (admin only, crée produit + variantes)
app.post('/products', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, description, base_price, category_id, variants } = req.body;
  const { data, error } = await supabase.from('products').insert({ name, description, base_price, category_id }).select().single();
  if (error) return res.status(500).json({ error });
  for (let v of variants) {
    await supabase.from('product_variants').insert({ product_id: data.id, ...v });
  }
  res.json(data);
});

// Route PUT /products/:id (update stock, vendeur/admin)
app.put('/products/:id', authenticateToken, requireRole(['admin', 'vendeur']), async (req, res) => {
  const { id } = req.params;
  const { stock_quantity, size } = req.body;
  const { error } = await supabase.from('product_variants').update({ stock_quantity }).eq('product_id', id).eq('size', size);
  if (error) return res.status(500).json({ error });
  res.json({ message: 'Stock mis à jour' });
});

// Route DELETE /products/:id (admin only)
app.delete('/products/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ message: 'Produit supprimé' });
});

// Route POST /auth/signup
app.post('/auth/signup', async (req, res) => {
  const { email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const { data, error } = await supabase.from('users').insert({ email, password_hash: hashedPassword, role }).select().single();
  if (error) return res.status(400).json({ error });
  const token = jwt.sign({ id: data.id }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// Route POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
  if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, role: user.role });
});

// Route GET /orders (toutes les commandes, admin only)
app.get('/orders', authenticateToken, requireRole(['admin', 'customer']), async (req, res) => {
  const { data, error } = await supabase.from('orders').select(`
    *,
    order_items (
      id,
      product_variant_id,
      quantity,
      unit_price
    )
  `);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Route GET /orders/:id (détail d'une commande, client ou admin)
app.get('/orders/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from('orders').select(`
    *,
    order_items (
      id,
      product_variant_id,
      quantity,
      unit_price
    )
  `).eq('id', id).single();
  if (error) return res.status(404).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Commande non trouvée' });
  res.json(data);
});

// Route POST /orders (crée une commande, client)
app.post('/orders', authenticateToken, requireRole(['customer']), async (req, res) => {
  const { user_id, order_items } = req.body; // order_items: array [{ product_variant_id, quantity }]
  const { data: order, error: orderError } = await supabase.from('orders').insert({
    user_id,
    total_amount: 0, // À calculer après
    status: 'pending'
  }).select().single();
  if (orderError) return res.status(500).json({ error: orderError.message });

  let total = 0;
  const itemsToInsert = order_items.map(item => {
    total += item.quantity * (item.unit_price || 0);
    return { order_id: order.id, ...item };
  });
  const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
  if (itemsError) return res.status(500).json({ error: itemsError.message });

  await supabase.from('orders').update({ total_amount: total }).eq('id', order.id);
  res.json(order);
});

// Route PUT /orders/:id (met à jour le statut, admin)
app.put('/orders/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const { error } = await supabase.from('orders').update({ status, updated_at: 'now()' }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Statut mis à jour' });
});

// Route GET /shopping-carts (liste du panier, client)
app.get('/shopping-carts', authenticateToken, requireRole(['customer']), async (req, res) => {
  const { data, error } = await supabase.from('shopping_carts').select(`
    *,
    product_variants (
      id,
      size,
      stock_quantity,
      price
    )
  `).eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Route POST /shopping-carts (ajoute un item, client)
app.post('/shopping-carts', authenticateToken, requireRole(['customer']), async (req, res) => {
  const { product_variant_id, quantity } = req.body;
  if (!product_variant_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'product_variant_id et quantity valides requis' });
  }
  try {
    // Vérifie si l'item existe déjà
    const { data: existing } = await supabase
      .from('shopping_carts')
      .select('quantity')
      .eq('user_id', req.user.id)
      .eq('product_variant_id', product_variant_id)
      .single();
    if (existing) {
      const newQuantity = existing.quantity + quantity;
      const { error } = await supabase
        .from('shopping_carts')
        .update({ quantity: newQuantity })
        .eq('user_id', req.user.id)
        .eq('product_variant_id', product_variant_id);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabase.from('shopping_carts').insert({
        user_id: req.user.id,
        product_variant_id,
        quantity
      });
      if (error) return res.status(500).json({ error: error.message });
    }
    res.json({ message: 'Item ajouté ou mis à jour dans le panier' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur interne', details: err.message });
  }
});

// Route DELETE /shopping-carts/:id (supprime un item, client)
app.delete('/shopping-carts/:id', authenticateToken, requireRole(['customer']), async (req, res) => {
  const { id } = req.params;
  console.log('Deleting cart item:', { id, userId: req.user.id }); // Débogage
  const { error, data } = await supabase.from('shopping_carts').delete().eq('id', id).eq('user_id', req.user.id);
  if (error) {
    console.error('Delete error:', error.message);
    return res.status(500).json({ error: error.message });
  }
  // Si pas d'erreur et data est vide, c'est une suppression réussie
  if (!error && (!data || data.length === 0)) {
    res.json({ message: 'Item supprimé du panier' });
  } else {
    return res.status(404).json({ error: 'Item non trouvé ou non autorisé' });
  }
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server sur port ${PORT}`));
