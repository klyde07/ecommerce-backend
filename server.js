const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: [
    'https://webdigi5-ecommerce-production.up.railway.app',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = process.env.JWT_SECRET;

// Middleware auth (vérifie JWT et récupère rôle)
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

// Middleware pour vérifier une permission spécifique
const requirePermission = (permissionName) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Authentification requise' });
  const { data: permissions } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role', req.user.role)
    .join('permissions', 'permissions.id = role_permissions.permission_id')
    .eq('permissions.name', permissionName);
  if (!permissions || permissions.length === 0) {
    return res.status(403).json({ error: 'Permission refusée' });
  }
  next();
};

// Route racine
app.get('/', (req, res) => res.send('API e-commerce en cours...'));

// Route GET /products
app.get('/products', authenticateToken, requirePermission('view_products'), async (req, res) => {
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

// Route POST /products (admin only)
app.post('/products', authenticateToken, requirePermission('manage_products'), async (req, res) => {
  const { name, description, base_price, category_id, variants } = req.body;
  const { data, error } = await supabase.from('products').insert({ name, description, base_price, category_id }).select().single();
  if (error) return res.status(500).json({ error });
  for (let v of variants) {
    await supabase.from('product_variants').insert({ product_id: data.id, ...v });
  }
  res.json(data);
});

// Route PUT /products/:id (vendeur/admin)
app.put('/products/:id', authenticateToken, requirePermission('manage_stocks'), async (req, res) => {
  const { id } = req.params;
  const { stock_quantity, size } = req.body;
  const { error } = await supabase.from('product_variants').update({ stock_quantity }).eq('product_id', id).eq('size', size);
  if (error) return res.status(500).json({ error });
  res.json({ message: 'Stock mis à jour' });
});

// Route DELETE /products/:id (admin only)
app.delete('/products/:id', authenticateToken, requirePermission('manage_products'), async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) return res.status(500).json({ error });
  res.json({ message: 'Produit supprimé' });
});

// Route POST /auth/signup
app.post('/auth/signup', async (req, res) => {
  const { email, password, first_name, last_name } = req.body;
  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit avoir au moins 6 caractères' });
  }
  const role = 'customer'; // Par défaut
  const redirectTo = 'https://webdigi5-ecommerce-production.up.railway.app/verify-email';
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name, last_name, role }, emailRedirectTo: redirectTo }
    });
    if (error) return res.status(400).json({ error: error.message });

    const { error: userError } = await supabase
      .from('users')
      .insert({ id: data.user.id, email, first_name, last_name, role });
    if (userError) return res.status(500).json({ error: userError.message });

    res.status(201).json({ message: 'Inscription réussie. Vérifiez votre email.', user: data.user });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Route POST /auth/login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
  if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: 'Identifiants invalides' });
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token, role: user.role });
});

// Route GET /orders (toutes commandes pour admin/vendeur, personnelles pour client)
app.get('/orders', authenticateToken, async (req, res) => {
  let query = supabase.from('orders').select(`
    *,
    order_items (
      id,
      product_variant_id,
      quantity,
      unit_price
    )
  `);
  if (req.user.role === 'client') {
    query = query.eq('user_id', req.user.id).requirePermission('view_orders');
  } else {
    query = query.requirePermission('view_all_orders');
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// Route POST /orders (client only)
app.post('/orders', authenticateToken, requirePermission('create_order'), async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items de commande invalides' });
  }
  try {
    const { data: order, error: orderError } = await supabase.from('orders').insert({
      user_id: req.user.id,
      status: 'pending',
      created_at: new Date().toISOString(),
      total_amount: 0
    }).select().single();
    if (orderError) throw orderError;

    let total = 0;
    const itemsToInsert = [];
    for (const item of items) {
      const { product_variant_id, quantity } = item;
      const { data: variant } = await supabase.from('product_variants').select('price').eq('id', product_variant_id).single();
      if (!variant) throw new Error(`Variante ${product_variant_id} non trouvée`);
      const itemTotal = variant.price * quantity;
      total += itemTotal;
      itemsToInsert.push({ order_id: order.id, product_variant_id, quantity, unit_price: variant.price });
    }
    const { error: itemsError } = await supabase.from('order_items').insert(itemsToInsert);
    if (itemsError) throw itemsError;

    const { error: updateError } = await supabase.from('orders').update({ total_amount: total }).eq('id', order.id);
    if (updateError) throw updateError;

    res.json({ message: 'Commande enregistrée avec succès', order_id: order.id });
  } catch (err) {
    console.error('Erreur commande:', err.message);
    res.status(500).json({ error: 'Erreur lors de la commande', details: err.message });
  }
});

// Autres routes (simplifiées, à ajuster avec permissions similaires)
app.put('/orders/:id', authenticateToken, requirePermission('update_order_status'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const { error } = await supabase.from('orders').update({ status, updated_at: 'now()' }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Statut mis à jour' });
});

app.get('/shopping-carts', authenticateToken, requirePermission('view_cart'), async (req, res) => {
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

app.post('/shopping-carts', authenticateToken, requirePermission('add_to_cart'), async (req, res) => {
  const { product_variant_id, quantity } = req.body;
  if (!product_variant_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'product_variant_id et quantity valides requis' });
  }
  try {
    const { data: existing } = await supabase.from('shopping_carts').select('quantity').eq('user_id', req.user.id).eq('product_variant_id', product_variant_id).single();
    if (existing) {
      const newQuantity = existing.quantity + quantity;
      const { error } = await supabase.from('shopping_carts').update({ quantity: newQuantity }).eq('user_id', req.user.id).eq('product_variant_id', product_variant_id);
      if (error) return res.status(500).json({ error: error.message });
    } else {
      const { error } = await supabase.from('shopping_carts').insert({ user_id: req.user.id, product_variant_id, quantity });
      if (error) return res.status(500).json({ error: error.message });
    }
    res.json({ message: 'Item ajouté ou mis à jour dans le panier' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur interne', details: err.message });
  }
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server sur port ${PORT}`));
