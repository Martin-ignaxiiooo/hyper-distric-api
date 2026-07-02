const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./config/db-pool');

const app = express();
app.use(cors());
app.use(express.json());

function esUrlExterna(url) {
    return /^(https?:)?\/\//i.test(url) || /^data:image\//i.test(url);
}

function normalizarImagenEntrada(url) {
    if (!url || !String(url).trim()) return null;

    const limpia = String(url).trim();
    if (esUrlExterna(limpia) || limpia.startsWith('./') || limpia.startsWith('/')) {
        return limpia;
    }

    return `./img/${limpia}`;
}

function existeImagenFrontend(url) {
    const rutaRelativa = url.replace(/^\.\//, '');
    const rutaImagen = path.join(__dirname, '../frontend', rutaRelativa);
    return fs.existsSync(rutaImagen);
}

function normalizarImagen(producto) {
    if (!producto.imagen) return producto;

    const imagen = normalizarImagenEntrada(producto.imagen);
    if (esUrlExterna(imagen)) {
        return {
            ...producto,
            imagen
        };
    }

    const imagenWebp = imagen.replace(/\.(jpg|jpeg|png)$/i, '.webp');

    return {
        ...producto,
        imagen: imagenWebp !== imagen && existeImagenFrontend(imagenWebp)
            ? imagenWebp
            : imagen
    };
}

async function guardarImagenProducto(connection, productoId, imagenUrl) {
    const urlNormalizada = normalizarImagenEntrada(imagenUrl);
    if (!urlNormalizada) return;

    const [imagenes] = await connection.query(
        'SELECT id FROM imagenes_producto WHERE producto_id = ? AND principal = TRUE LIMIT 1',
        [productoId]
    );

    if (imagenes.length > 0) {
        await connection.query(
            'UPDATE imagenes_producto SET url = ? WHERE id = ?',
            [urlNormalizada, imagenes[0].id]
        );
    } else {
        await connection.query(
            'INSERT INTO imagenes_producto (producto_id, url, principal) VALUES (?, ?, TRUE)',
            [productoId, urlNormalizada]
        );
    }
}


app.get('/productos', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT p.id, p.nombre, p.slug, p.precio, p.stock, p.descripcion, 
                   p.color, p.estilo, p.material, p.badge,
                   c.nombre as categoria, i.url as imagen
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN imagenes_producto i ON p.id = i.producto_id AND i.principal = TRUE
        `);
        res.json(rows.map(normalizarImagen));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/productos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT p.id, p.nombre, p.slug, p.precio, p.stock, p.descripcion, 
                   p.color, p.estilo, p.material, p.badge,
                   c.nombre as categoria, i.url as imagen
            FROM productos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN imagenes_producto i ON p.id = i.producto_id AND i.principal = TRUE
            WHERE p.id = ?
        `, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(normalizarImagen(rows[0]));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/productos/categoria/:categoria', async (req, res) => {
    const { categoria } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT p.id, p.nombre, p.slug, p.precio, p.stock, p.descripcion, 
                   p.color, p.estilo, p.material, p.badge,
                   c.nombre as categoria, i.url as imagen
            FROM productos p
            JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN imagenes_producto i ON p.id = i.producto_id AND i.principal = TRUE
            WHERE c.nombre = ?
        `, [categoria]);
        res.json(rows.map(normalizarImagen));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.post('/productos', async (req, res) => {
    const { nombre, slug, precio, stock, categoria_id, descripcion, imagen_url, color, estilo, material, badge } = req.body;
    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();
        
        const [result] = await connection.query(
            'INSERT INTO productos (nombre, slug, precio, stock, categoria_id, descripcion, color, estilo, material, badge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nombre, slug, precio, stock, categoria_id, descripcion, color, estilo, material, badge]
        );
        
        const prodId = result.insertId;
        
        await guardarImagenProducto(connection, prodId, imagen_url);
        
        await connection.commit();
        connection.release();
        
        res.status(201).json({ id: prodId, mensaje: 'Producto creado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.put('/productos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, slug, precio, stock, categoria_id, descripcion, imagen_url, color, estilo, material, badge } = req.body;
    try {
        const connection = await db.getConnection();
        await connection.beginTransaction();
        
        await connection.query(
            'UPDATE productos SET nombre=?, slug=?, precio=?, stock=?, categoria_id=?, descripcion=?, color=?, estilo=?, material=?, badge=? WHERE id=?',
            [nombre, slug, precio, stock, categoria_id, descripcion, color, estilo, material, badge, id]
        );
        
        await guardarImagenProducto(connection, id, imagen_url);
        
        await connection.commit();
        connection.release();
        
        res.json({ mensaje: 'Producto actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.put('/productos/:id/stock', async (req, res) => {
    const { id } = req.params;
    const { stock } = req.body;
    try {
        await db.query('UPDATE productos SET stock=? WHERE id=?', [stock, id]);
        res.json({ mensaje: 'Stock actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.delete('/productos/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM productos WHERE id = ?', [id]);
        res.json({ mensaje: 'Producto eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3002, () => console.log('Servicio Productos corriendo en puerto 3002'));


