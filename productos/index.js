const express = require('express');
const cors = require('cors');
const supabase = require('./supabase');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;

function normalizarImagenDb(producto) {
    if (!producto) return producto;
    
    const categoria = producto.categorias?.nombre || null;
    let imagen = null;
    
    if (producto.imagenes_producto && producto.imagenes_producto.length > 0) {
        imagen = producto.imagenes_producto[0].url;
    }
    
    const res = { ...producto, categoria, imagen };
    delete res.categorias;
    delete res.imagenes_producto;
    return res;
}

app.get('/productos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('productos')
            .select(`
                *,
                categorias (nombre),
                imagenes_producto (url)
            `);
        if (error) throw error;
        
        const productosFormat = data.map(p => {
            if (p.imagenes_producto && p.imagenes_producto.length > 0) {
                p.imagenes_producto = [p.imagenes_producto[0]]; 
            }
            return normalizarImagenDb(p);
        });
        
        res.json(productosFormat);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/productos/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('productos')
            .select(`
                *,
                categorias (nombre),
                imagenes_producto (url)
            `)
            .eq('id', req.params.id)
            .single();
            
        if (error || !data) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(normalizarImagenDb(data));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/productos/:id/reduce-stock', async (req, res) => {
    const { cantidad } = req.body;
    const { id } = req.params;
    
    try {
        const { data: prod } = await supabase.from('productos').select('stock').eq('id', id).single();
        if (!prod || prod.stock < cantidad) return res.status(400).json({ error: 'Stock insuficiente' });
        
        const { error } = await supabase.from('productos').update({ stock: prod.stock - cantidad }).eq('id', id);
        if (error) throw error;
        
        res.json({ mensaje: 'Stock reducido' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/productos', async (req, res) => {
    try {
        const payload = { ...req.body };
        const imagenUrl = payload.imagen_url;
        delete payload.imagen_url;

        const { data, error } = await supabase.from('productos').insert([payload]).select();
        if (error) throw error;
        
        const nuevoProducto = data[0];
        
        if (imagenUrl) {
            await supabase.from('imagenes_producto').insert([{ producto_id: nuevoProducto.id, url: imagenUrl }]);
        }
        
        res.status(201).json({ mensaje: 'Producto creado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/productos/:id', async (req, res) => {
    try {
        const payload = { ...req.body };
        const imagenUrl = payload.imagen_url;
        delete payload.imagen_url;

        const { error } = await supabase.from('productos').update(payload).eq('id', req.params.id);
        if (error) throw error;
        
        if (imagenUrl !== undefined) {
            const { data: imgs } = await supabase.from('imagenes_producto').select('id').eq('producto_id', req.params.id);
            if (imgs && imgs.length > 0) {
                await supabase.from('imagenes_producto').update({ url: imagenUrl }).eq('id', imgs[0].id);
            } else {
                await supabase.from('imagenes_producto').insert([{ producto_id: req.params.id, url: imagenUrl }]);
            }
        }

        res.json({ mensaje: 'Producto actualizado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/productos/:id', async (req, res) => {
    try {
        // 1. Eliminar primero las dependencias (imágenes y detalles de pedidos) para evitar error de foreign key
        await supabase.from('imagenes_producto').delete().eq('producto_id', req.params.id);
        await supabase.from('detalle_pedido').delete().eq('producto_id', req.params.id);

        // 2. Ahora sí eliminar el producto principal
        const { error } = await supabase.from('productos').delete().eq('id', req.params.id);
        if (error) throw error;
        
        res.json({ mensaje: 'Producto eliminado exitosamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/productos/:id/stock', async (req, res) => {
    try {
        const { stock } = req.body;
        if (stock === undefined) return res.status(400).json({ error: 'Falta el stock' });
        const { error } = await supabase.from('productos').update({ stock }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ mensaje: 'Stock actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Microservicio de PRODUCTOS corriendo en el puerto ${PORT}`);
});


