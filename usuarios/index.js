const express = require('express');
const cors = require('cors');
const supabase = require('./supabase');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data: user, error } = await supabase
            .from('usuarios')
            .select('*')
            .eq('email', email)
            .eq('password', password)
            .single();

        if (error || !user) {
            return res.status(401).json({ mensaje: 'Credenciales inválidas' });
        }
        res.json({ 
            usuario: { 
                id: user.id, 
                nombre: user.nombre, 
                email: user.email, 
                rol: user.rol_id === 1 ? 'admin' : 'cliente' 
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/usuarios', async (req, res) => {
    const { nombre, email, password } = req.body;
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .insert([{ nombre, email, password, rol_id: 2 }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ 
            usuario: { 
                id: data.id, 
                nombre: data.nombre, 
                email: data.email, 
                rol: 'cliente' 
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/usuarios/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nombre, email, rol_id')
            .eq('id', req.params.id)
            .single();
        
        if (error || !data) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/usuarios', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nombre, email, rol_id');
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Microservicio de USUARIOS corriendo en el puerto ${PORT}`);
});


