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
    .eq('is_active', true); // Filtre pour is_active
  if (category) query = query.eq('category_id', category);
  if (size) query = query.eq('product_variants.size', size);
  const { data, error } = await query;
  if (error) {
    console.error('Supabase error:', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.json(data || []);
});
