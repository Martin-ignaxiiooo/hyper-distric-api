const express = require('express');
const cors = require('cors');
const db = require('./config/db-pool');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

function nombreTarjetaValido(nombre) {
    const limpio = String(nombre || '').trim().replace(/\s+/g, ' ');
    const partes = limpio.split(' ').filter(Boolean);
    const letras = limpio.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '');

    return limpio.length >= 8 &&
        letras.length >= 6 &&
        partes.length >= 2 &&
        partes.every(parte => parte.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/g, '').length >= 2);
}

function expiracionValida(expiracion) {
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiracion)) return false;

    const [mes, anio] = expiracion.split('/').map(Number);
    const fechaLimite = new Date(2000 + anio, mes, 1);
    const hoy = new Date();
    const mesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    return fechaLimite > mesActual;
}

function validarCantidad(cantidad) {
    return Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 20;
}




const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});


const enviarComprobante = async (emailUsuario, datosCompra) => {
    let itemsHtml = datosCompra.items.map(item => `
        <tr>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; color:#333;">
                ${item.cantidad}x ${item.nombre} (Talla ${item.talla || '-'})
            </td>
            <td style="padding:10px 8px; border-bottom:1px solid #eee; text-align:right; color:#333;">
                CLP $${(item.precio_unitario * item.cantidad).toLocaleString('es-CL')}
            </td>
        </tr>
    `).join('');

    const mailOptions = {
        from: `"Hyper Distric" <${process.env.EMAIL_USER}>`,
        to: emailUsuario,
        subject: `✅ Confirmación de tu compra #${datosCompra.idOrden} en Hyper Distric`,
        html: `
            <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto; background:#f9f9f9; border-radius:10px; overflow:hidden;">
                <div style="background:#000; padding:30px; text-align:center;">
                    <h1 style="color:#fff; margin:0; font-size:1.5rem;">HD Hyper Distric</h1>
                </div>
                <div style="padding:30px;">
                    <h2 style="color:#111;">¡Gracias por tu compra!</h2>
                    <p style="color:#555;">Hemos procesado tu pago con éxito. Aquí está el detalle de tu pedido:</p>
                    <div style="background:#fff; border-radius:8px; padding:20px; border:1px solid #ddd; margin:20px 0;">
                        <p style="color:#888; font-size:0.85rem; margin:0 0 15px 0;">ORDEN #${datosCompra.idOrden}</p>
                        <table style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr style="background:#f3f3f3;">
                                    <th style="text-align:left; padding:10px 8px; color:#666; font-size:0.9rem;">Producto</th>
                                    <th style="text-align:right; padding:10px 8px; color:#666; font-size:0.9rem;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>${itemsHtml}</tbody>
                            <tfoot>
                                <tr>
                                    <td style="padding:15px 8px; font-weight:bold; font-size:1.1rem;">TOTAL PAGADO</td>
                                    <td style="padding:15px 8px; font-weight:bold; font-size:1.1rem; text-align:right; color:#16a34a;">
                                        CLP $${Number(datosCompra.total).toLocaleString('es-CL')}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <p style="color:#555;">Tu pedido está siendo procesado y te contactaremos pronto.</p>
                    <p style="color:#999; font-size:0.8rem;">Si tienes dudas, escríbenos a soporte@hyperdistric.cl</p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️  Comprobante enviado exitosamente a: ${emailUsuario}`);
    } catch (error) {
        console.error('⚠️  Error al enviar correo:', error.message);
    }
};



app.post('/checkout', async (req, res) => {
    const { usuario_id, carrito, total, tarjeta } = req.body;

    if (!usuario_id || !Array.isArray(carrito) || carrito.length === 0) {
        return res.status(400).json({ error: 'Datos de compra incompletos.' });
    }
    if (!tarjeta || !tarjeta.numero || !tarjeta.nombre || !tarjeta.expiracion || !tarjeta.cvv) {
        return res.status(400).json({ error: 'Datos de tarjeta incompletos.' });
    }

    const usuarioId = Number(usuario_id);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return res.status(400).json({ error: 'Usuario invalido para la compra.' });
    }

    const totalCliente = Number(total);
    if (!Number.isFinite(totalCliente) || totalCliente <= 0) {
        return res.status(400).json({ error: 'Total de compra invalido.' });
    }

    const numeroLimpio = String(tarjeta.numero).replace(/\D/g, '');
    const nombreTarjeta = String(tarjeta.nombre).trim().replace(/\s+/g, ' ');
    const expiracionTarjeta = String(tarjeta.expiracion).trim();
    const cvvLimpio = String(tarjeta.cvv).replace(/\D/g, '');

    if (!/^\d{16}$/.test(numeroLimpio)) {
        return res.status(400).json({ error: 'Numero de tarjeta invalido. Debe tener 16 digitos.' });
    }
    if (!nombreTarjetaValido(nombreTarjeta)) {
        return res.status(400).json({ error: 'Ingresa nombre y apellido como aparece en la tarjeta.' });
    }
    if (!expiracionValida(expiracionTarjeta)) {
        return res.status(400).json({ error: 'Fecha de expiracion invalida o vencida. Formato: MM/AA.' });
    }
    if (!/^\d{3}$/.test(cvvLimpio)) {
        return res.status(400).json({ error: 'CVV invalido. Debe tener exactamente 3 numeros.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [usuarioRows] = await connection.query('SELECT id, email FROM usuarios WHERE id = ?', [usuarioId]);
        if (usuarioRows.length === 0) {
            throw new Error('Debes iniciar sesion con una cuenta valida antes de comprar.');
        }
        const usuarioCompra = usuarioRows[0];

        const itemsSolicitados = [];
        const cantidadesPorProducto = new Map();

        for (const item of carrito) {
            const productoId = Number(item.producto_id);
            const cantidad = Number(item.cantidad);

            if (!Number.isInteger(productoId) || productoId <= 0 || !validarCantidad(cantidad)) {
                throw new Error('Hay un producto con cantidad invalida en el carrito.');
            }

            itemsSolicitados.push({
                producto_id: productoId,
                cantidad,
                talla: String(item.talla || '-').trim() || '-'
            });
            cantidadesPorProducto.set(productoId, (cantidadesPorProducto.get(productoId) || 0) + cantidad);
        }

        const productosPorId = new Map();
        for (const [productoId, cantidadTotal] of cantidadesPorProducto.entries()) {
            const [rows] = await connection.query('SELECT id, stock, nombre, precio FROM productos WHERE id = ? FOR UPDATE', [productoId]);
            if (rows.length === 0) throw new Error(`Producto ID ${productoId} no existe`);
            if (rows[0].stock < cantidadTotal) {
                throw new Error(`Stock insuficiente para "${rows[0].nombre}"`);
            }
            productosPorId.set(productoId, rows[0]);
        }

        const itemsValidados = itemsSolicitados.map(item => {
            const producto = productosPorId.get(item.producto_id);
            return {
                producto_id: producto.id,
                cantidad: item.cantidad,
                precio_unitario: Number(producto.precio),
                talla: item.talla,
                nombre: producto.nombre
            };
        });

        const totalCalculado = itemsValidados.reduce((acc, item) => {
            return acc + item.precio_unitario * item.cantidad;
        }, 0);

        if (totalCalculado !== totalCliente) {
            throw new Error('El total de la compra no coincide con los precios actuales.');
        }

        const [resultPedido] = await connection.query(
            'INSERT INTO pedidos (usuario_id, estado_id, total) VALUES (?, ?, ?)',
            [usuarioId, 2, totalCalculado]
        );
        const pedidoId = resultPedido.insertId;

        for (const item of itemsValidados) {
            await connection.query(
                'INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
                [pedidoId, item.producto_id, item.cantidad, item.precio_unitario]
            );
        }

        for (const [productoId, cantidadTotal] of cantidadesPorProducto.entries()) {
            await connection.query('UPDATE productos SET stock = stock - ? WHERE id = ?', [cantidadTotal, productoId]);
        }

        await connection.commit();

        const userEmail = usuarioCompra.email;

        if (userEmail) {
            enviarComprobante(userEmail, {
                idOrden: pedidoId,
                total: totalCalculado,
                items: itemsValidados
            });
        }

        res.status(201).json({
            mensaje: 'Pago procesado con exito.',
            pedido_id: pedidoId,
            email: userEmail,
            total: totalCalculado
        });

    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.post('/ventas', async (req, res) => {
    const { usuario_id, carrito, total } = req.body;
    
    
    if (!usuario_id || !carrito || carrito.length === 0) {
        return res.status(400).json({ error: 'Faltan datos de la compra' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        
        for (const item of carrito) {
            const [rows] = await connection.query('SELECT stock, nombre FROM productos WHERE id = ?', [item.producto_id]);
            if (rows.length === 0) throw new Error(`Producto ID ${item.producto_id} no existe`);
            if (rows[0].stock < item.cantidad) {
                throw new Error(`Stock insuficiente para ${rows[0].nombre}`);
            }
        }

        const estado_id = 1;

        
        const [resultPedido] = await connection.query(
            'INSERT INTO pedidos (usuario_id, estado_id, total) VALUES (?, ?, ?)',
            [usuario_id, estado_id, total]
        );
        const pedidoId = resultPedido.insertId;

        
        for (const item of carrito) {
            await connection.query(
                'INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)',
                [pedidoId, item.producto_id, item.cantidad, item.precio_unitario]
            );

            await connection.query(
                'UPDATE productos SET stock = stock - ? WHERE id = ?',
                [item.cantidad, item.producto_id]
            );
        }

        await connection.commit();
        
        
        if (transporter) {
            try {
                const [userRows] = await db.query('SELECT email FROM usuarios WHERE id = ?', [usuario_id]);
                const userEmail = userRows.length > 0 ? userRows[0].email : 'anonimo@hyperdistric.cl';
                
                let itemsHtml = '';
                for (const item of carrito) {
                    const [pRows] = await db.query('SELECT nombre FROM productos WHERE id = ?', [item.producto_id]);
                    const pNombre = pRows.length > 0 ? pRows[0].nombre : 'Producto ' + item.producto_id;
                    itemsHtml += `
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.cantidad}x ${pNombre}</td>
                            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">CLP $${(item.precio_unitario * item.cantidad).toLocaleString('es-CL')}</td>
                        </tr>
                    `;
                }

                const htmlStr = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
                        <h2 style="color: #000; border-bottom: 2px solid #000; padding-bottom: 10px;">¡Gracias por tu compra en Hyper Distric!</h2>
                        <p>Tu pedido <strong>#${pedidoId}</strong> ha sido confirmado y procesado.</p>
                        
                        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                            <thead>
                                <tr style="background: #f9f9f9;">
                                    <th style="text-align: left; padding: 10px; border-bottom: 1px solid #ddd;">Producto</th>
                                    <th style="text-align: right; padding: 10px; border-bottom: 1px solid #ddd;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td style="padding: 10px; font-weight: bold; text-align: right;">TOTAL PAGADO:</td>
                                    <td style="padding: 10px; font-weight: bold; text-align: right; color: #4ade80;">CLP $${Number(total).toLocaleString('es-CL')}</td>
                                </tr>
                            </tfoot>
                        </table>
                        <p style="margin-top: 30px; font-size: 0.9em; color: #777;">Si tienes alguna duda con tu pedido, contáctanos a soporte@hyperdistric.cl</p>
                    </div>
                `;

                const info = await transporter.sendMail({
                    from: '"Hyper Distric Store" <ventas@hyperdistric.cl>',
                    to: userEmail,
                    subject: `Recibo de tu compra #${pedidoId} en Hyper Distric`,
                    html: htmlStr
                });

                console.log("\n==========================================");
                console.log(`✉️ Correo de prueba enviado a: ${userEmail}`);
                console.log(`🔗 VER CORREO (Simulado): ${nodemailer.getTestMessageUrl(info)}`);
                console.log("==========================================\n");
            } catch (emailErr) {
                console.error("Error al enviar email:", emailErr);
            }
        }

        res.status(201).json({ mensaje: 'Compra registrada con éxito', pedido_id: pedidoId });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});


app.get('/ventas', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT p.id, u.email as usuario, e.nombre as estado, p.total, p.fecha,
                   (
                       SELECT JSON_ARRAYAGG(JSON_OBJECT('cantidad', dp.cantidad, 'precio_unitario', dp.precio_unitario, 'nombre', prod.nombre))
                       FROM detalle_pedido dp
                       JOIN productos prod ON dp.producto_id = prod.id
                       WHERE dp.pedido_id = p.id
                   ) as detalles
            FROM pedidos p
            JOIN usuarios u ON p.usuario_id = u.id
            JOIN estados_pedido e ON p.estado_id = e.id
            ORDER BY p.fecha DESC
        `);
        
        
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/ventas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [pedidos] = await db.query(`
            SELECT p.id, u.email, e.nombre as estado, p.total, p.fecha 
            FROM pedidos p JOIN usuarios u ON p.usuario_id = u.id JOIN estados_pedido e ON p.estado_id = e.id
            WHERE p.id = ?
        `, [id]);
        
        if (pedidos.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });

        const [detalles] = await db.query(`
            SELECT dp.cantidad, dp.precio_unitario, prod.nombre 
            FROM detalle_pedido dp 
            JOIN productos prod ON dp.producto_id = prod.id 
            WHERE dp.pedido_id = ?
        `, [id]);

        res.json({ pedido: pedidos[0], detalles });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.get('/ventas/usuario/:usuarioId', async (req, res) => {
    const { usuarioId } = req.params;

    if (!Number.isInteger(Number(usuarioId)) || Number(usuarioId) <= 0) {
        return res.status(400).json({ error: 'Usuario invalido' });
    }

    try {
        const [rows] = await db.query(`
            SELECT p.id, e.nombre as estado, p.total, p.fecha,
                   (
                       SELECT JSON_ARRAYAGG(JSON_OBJECT('cantidad', dp.cantidad, 'precio_unitario', dp.precio_unitario, 'nombre', prod.nombre))
                       FROM detalle_pedido dp
                       JOIN productos prod ON dp.producto_id = prod.id
                       WHERE dp.pedido_id = p.id
                   ) as detalles
            FROM pedidos p
            JOIN estados_pedido e ON p.estado_id = e.id
            WHERE p.usuario_id = ? ORDER BY p.fecha DESC
        `, [usuarioId]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


app.put('/ventas/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado_id } = req.body;
    try {
        await db.query('UPDATE pedidos SET estado_id = ? WHERE id = ?', [estado_id, id]);
        res.json({ mensaje: 'Estado de pedido actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});





app.post('/pagos/crear-sesion', (req, res) => {
    
    res.json({ mensaje: 'Sesión de pago simulada creada', session_url: 'http://localhost:5500/simulador-pago' });
});

app.post('/pagos/confirmar', async (req, res) => {
    
    const { pedido_id } = req.body;
    try {
        await db.query('UPDATE pedidos SET estado_id = 2 WHERE id = ?', [pedido_id]);
        res.json({ mensaje: 'Pago simulado confirmado con éxito' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/notificaciones/compra', (req, res) => {
    
    const { usuario_email, pedido_id } = req.body;
    console.log(`[NOTIFICACIÓN] Enviando correo simulado a ${usuario_email} por pedido #${pedido_id}`);
    res.json({ mensaje: 'Notificación enviada al cliente (en proceso)' });
});

app.listen(3003, () => console.log('Servicio Ventas corriendo en puerto 3003'));


