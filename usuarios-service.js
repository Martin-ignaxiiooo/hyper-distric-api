const express = require('express');
const cors = require('cors');
const db = require('./config/db-pool');

const app = express();
app.use(cors());
app.use(express.json());


app.post('/usuarios/registro', async (req, res) => {
    const { nombre, email, password } = req.body;
    try {
        const [existe] = await db.query('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (existe.length > 0) {
            return res.status(400).json({ mensaje: 'El usuario ya existe' });
        }
        
        
        await db.query('INSERT INTO usuarios (nombre, email, password, rol_id) VALUES (?, ?, ?, ?)', 
            [nombre, email, password, 2]);
            
        res.status(201).json({ mensaje: 'Usuario registrado exitosamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
});


app.post('/usuarios/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [rows] = await db.query(`
            SELECT u.id, u.nombre, u.email, r.nombre as rol 
            FROM usuarios u 
            JOIN roles r ON u.rol_id = r.id 
            WHERE u.email = ? AND u.password = ?
        `, [email, password]);

        if (rows.length > 0) {
            res.json({ mensaje: 'Login exitoso', usuario: rows[0] });
        } else {
            res.status(401).json({ mensaje: 'Credenciales incorrectas' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});


app.get('/usuarios', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT u.id, u.nombre, u.email, r.nombre as rol 
            FROM usuarios u 
            LEFT JOIN roles r ON u.rol_id = r.id
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(`
            SELECT u.id, u.nombre, u.email, r.nombre as rol 
            FROM usuarios u 
            LEFT JOIN roles r ON u.rol_id = r.id 
            WHERE u.id = ?
        `, [id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.put('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, email, password, rol_id } = req.body;
    try {
        await db.query(
            'UPDATE usuarios SET nombre=?, email=?, password=?, rol_id=? WHERE id=?',
            [nombre, email, password, rol_id, id]
        );
        res.json({ mensaje: 'Usuario actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.delete('/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM usuarios WHERE id = ?', [id]);
        res.json({ mensaje: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3001, () => console.log('Servicio Usuarios corriendo en puerto 3001'));


