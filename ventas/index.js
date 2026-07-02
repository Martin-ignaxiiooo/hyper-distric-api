const express = require('express');
const cors = require('cors');
const supabase = require('./supabase');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3003;

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-1234' });
const BASE_URL_FRONTEND = process.env.BASE_URL_FRONTEND || 'http://localhost:5500';

app.post('/ventas', async (req, res) => {
    const { usuario_id, carrito } = req.body;
    if (!usuario_id || !carrito || !carrito.length) return res.status(400).json({ error: 'Datos inválidos' });

    try {
        let total = 0;
        const detalles = [];
        
        for (const item of carrito) {
            const { data: prod } = await supabase.from('productos').select('*').eq('id', item.producto_id).single();
            if (!prod || prod.stock < item.cantidad) throw new Error(`Stock insuficiente para ${prod?.nombre}`);
            
            total += (prod.precio * item.cantidad);
            detalles.push({ producto_id: prod.id, cantidad: item.cantidad, precio_unitario: prod.precio });
        }

        const { data: pedido, error: errPedido } = await supabase
            .from('pedidos')
            .insert([{ usuario_id, estado_id: 1, total }])
            .select()
            .single();
            
        if (errPedido) throw errPedido;

        const detallesToInsert = detalles.map(d => ({ ...d, pedido_id: pedido.id }));
        const { error: errDetalles } = await supabase.from('detalle_pedido').insert(detallesToInsert);
        if (errDetalles) throw errDetalles;
        
        for (const det of detalles) {
            const { data: p } = await supabase.from('productos').select('stock').eq('id', det.producto_id).single();
            await supabase.from('productos').update({ stock: p.stock - det.cantidad }).eq('id', det.producto_id);
        }

        res.status(201).json({ mensaje: 'Venta registrada', pedido_id: pedido.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/ventas/usuario/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                estados_pedido (nombre),
                detalle_pedido (
                    cantidad,
                    precio_unitario,
                    productos (nombre)
                )
            `)
            .eq('usuario_id', req.params.id)
            .order('fecha', { ascending: false });

        if (error) throw error;

        const pedidosFormateados = data.map(p => ({
            id: p.id,
            total: p.total,
            estado: p.estados_pedido?.nombre || 'Desconocido',
            fecha: p.fecha,
            detalles: (p.detalle_pedido || []).map(d => ({
                cantidad: d.cantidad,
                precio_unitario: d.precio_unitario,
                nombre: d.productos?.nombre || 'Producto Desconocido'
            }))
        }));

        res.json(pedidosFormateados);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/mercadopago/create', async (req, res) => {
    const { usuario_id, carrito } = req.body;
    try {
        let totalFinal = 0;
        for (const item of carrito) {
            const { data: prod } = await supabase.from('productos').select('*').eq('id', item.producto_id).single();
            if (!prod || prod.stock < item.cantidad) throw new Error(`Stock insuficiente`);
            item.precio_unitario = prod.precio;
            item.nombre = prod.nombre;
            totalFinal += prod.precio * item.cantidad;
        }

        const { data: pedido, error } = await supabase.from('pedidos').insert([{ usuario_id, estado_id: 1, total: totalFinal }]).select().single();
        if (error) throw error;
        
        const detalles = carrito.map(item => ({ pedido_id: pedido.id, producto_id: item.producto_id, cantidad: item.cantidad, precio_unitario: item.precio_unitario }));
        await supabase.from('detalle_pedido').insert(detalles);

        const preference = new Preference(client);
        const result = await preference.create({
            body: {
                items: carrito.map(item => ({
                    id: String(item.producto_id),
                    title: item.nombre,
                    quantity: Number(item.cantidad),
                    unit_price: Number(item.precio_unitario),
                    currency_id: 'CLP'
                })),
                back_urls: {
                    success: `${BASE_URL_FRONTEND}/exito.html?pedido_id=${pedido.id}&metodo=mp`,
                    failure: `${BASE_URL_FRONTEND}/carrito.html`,
                    pending: `${BASE_URL_FRONTEND}/carrito.html`
                },
                external_reference: String(pedido.id),
                notification_url: 'https://hyper-distric-ventas.onrender.com/mercadopago/webhook'
            }
        });

        res.json({ pedido_id: pedido.id, init_point: result.init_point, sandbox_init_point: result.sandbox_init_point });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/mercadopago/webhook', async (req, res) => {
    try {
        const paymentId = req.query['data.id'] || (req.body.data && req.body.data.id);
        
        if (req.body.type === 'payment' || req.query.type === 'payment') {
            const payment = await new Payment(client).get({ id: paymentId });
            
            if (payment.status === 'approved') {
                const pedidoId = payment.external_reference;
                const { data: pedido } = await supabase.from('pedidos').select('*').eq('id', pedidoId).single();
                
                if (pedido && pedido.estado_id === 1) {
                    await supabase.from('pedidos').update({ estado_id: 2 }).eq('id', pedidoId);
                    
                    const { data: detalles } = await supabase.from('detalle_pedido').select('*').eq('pedido_id', pedidoId);
                    for (const det of detalles) {
                        const { data: p } = await supabase.from('productos').select('stock').eq('id', det.producto_id).single();
                        await supabase.from('productos').update({ stock: p.stock - det.cantidad }).eq('id', det.producto_id);
                    }
                }
            }
        }
        res.status(200).send('OK');
    } catch (err) {
        console.error("Error en webhook:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/mercadopago/success', async (req, res) => {
    // Esta ruta ya no hace las modificaciones de base de datos,
    // se deja solo por compatibilidad si el frontend aún la llama.
    res.json({ success: true, mensaje: 'Delegado al webhook' });
});

app.get('/ventas', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('pedidos')
            .select(`
                *,
                estados_pedido (nombre),
                usuarios (nombre, email),
                detalle_pedido (
                    cantidad,
                    precio_unitario,
                    productos (nombre)
                )
            `)
            .order('fecha', { ascending: false });

        if (error) throw error;
        
        const ventasFormateadas = data.map(p => ({
            id: p.id,
            total: p.total,
            estado: p.estados_pedido?.nombre || 'Desconocido',
            fecha: p.fecha,
            email: p.usuarios?.email || 'Desconocido',
            usuario: p.usuarios?.nombre || 'Desconocido',
            detalles: (p.detalle_pedido || []).map(d => ({
                cantidad: d.cantidad,
                precio_unitario: d.precio_unitario,
                nombre: d.productos?.nombre || 'Producto Desconocido'
            }))
        }));

        res.json(ventasFormateadas);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/ventas/:id/estado', async (req, res) => {
    try {
        const { estado_id } = req.body;
        if (!estado_id) return res.status(400).json({ error: 'Falta estado_id' });
        
        const { error } = await supabase.from('pedidos').update({ estado_id }).eq('id', req.params.id);
        if (error) throw error;
        
        res.json({ mensaje: 'Estado actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Microservicio de VENTAS corriendo en el puerto ${PORT}`);
});


