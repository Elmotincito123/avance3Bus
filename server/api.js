// API REST para NORTEEXPRESO - Versión actualizada con mejor manejo de base de datos
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'norteexpreso_secret_key';

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Middleware para logging de requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Middleware para verificar JWT
const verificarToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};

// ==========================================
// RUTAS DE AUTENTICACIÓN
// ==========================================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;
    console.log(`🔐 Intento de login para usuario: ${usuario}`);
    
    // Buscar usuario en la base de datos
    const [usuarios] = await db.pool.execute(`
      SELECT 
        u.codigo,
        u.usuario,
        u.clave,
        u.estado,
        u.tipo_usuario_codigo,
        tu.descripcion as tipo_usuario,
        CONCAT(p.nombre, ' ', p.apellidos) as nombre_completo,
        e.email
      FROM USUARIOS u
      INNER JOIN TIPO_USUARIO tu ON u.tipo_usuario_codigo = tu.codigo
      INNER JOIN EMPLEADO e ON u.empleado_codigo = e.codigo
      INNER JOIN PERSONA p ON e.codigo = p.codigo
      WHERE u.usuario = ? AND u.estado = 'activo'
    `, [usuario]);
    
    if (usuarios.length === 0) {
      console.log(`❌ Usuario no encontrado: ${usuario}`);
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    const usuarioData = usuarios[0];
    
    // Verificar contraseña
    const passwordValida = await bcrypt.compare(password, usuarioData.clave);
    if (!passwordValida) {
      console.log(`❌ Contraseña incorrecta para usuario: ${usuario}`);
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    
    // Generar JWT
    const token = jwt.sign(
      { 
        codigo: usuarioData.codigo,
        usuario: usuarioData.usuario,
        tipo_usuario: usuarioData.tipo_usuario
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    console.log(`✅ Login exitoso para usuario: ${usuario}`);
    
    res.json({
      token,
      usuario: {
        codigo: usuarioData.codigo,
        usuario: usuarioData.usuario,
        nombre_completo: usuarioData.nombre_completo,
        email: usuarioData.email,
        tipo_usuario: usuarioData.tipo_usuario
      }
    });
    
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ==========================================
// RUTAS PÚBLICAS (sin autenticación)
// ==========================================

// Obtener rutas disponibles
app.get('/api/rutas', async (req, res) => {
  try {
    console.log('📍 Obteniendo rutas disponibles...');
    const rutas = await db.obtenerRutas();
    console.log(`✅ ${rutas.length} rutas encontradas`);
    res.json(rutas);
  } catch (error) {
    console.error('❌ Error al obtener rutas:', error);
    res.status(500).json({ error: 'Error al obtener rutas' });
  }
});

// Buscar viajes
app.get('/api/viajes/buscar', async (req, res) => {
  try {
    const { origen, destino, fecha } = req.query;
    console.log(`🔍 Buscando viajes: ${origen} → ${destino} el ${fecha}`);
    
    const [viajes] = await db.pool.execute(`
      SELECT 
        v.codigo,
        v.fecha_hora_salida,
        v.fecha_hora_llegada_estimada,
        v.estado,
        r.origen,
        r.destino,
        r.costo_referencial,
        b.placa,
        b.fabricante,
        b.num_asientos,
        CONCAT(p.nombre, ' ', p.apellidos) as chofer_nombre,
        (b.num_asientos - COALESCE(asientos_ocupados.ocupados, 0)) as asientos_disponibles
      FROM VIAJE v
      INNER JOIN RUTAS r ON v.ruta_codigo = r.codigo
      INNER JOIN BUSES b ON v.bus_codigo = b.codigo
      INNER JOIN CHOFER ch ON v.chofer_codigo = ch.codigo
      INNER JOIN EMPLEADO e ON ch.codigo = e.codigo
      INNER JOIN PERSONA p ON e.codigo = p.codigo
      LEFT JOIN (
        SELECT viaje_codigo, COUNT(*) as ocupados
        FROM PASAJE 
        WHERE estado = 'Vendido'
        GROUP BY viaje_codigo
      ) asientos_ocupados ON v.codigo = asientos_ocupados.viaje_codigo
      WHERE r.origen = ? 
        AND r.destino = ? 
        AND DATE(v.fecha_hora_salida) = ?
        AND v.estado = 'Programado'
      ORDER BY v.fecha_hora_salida
    `, [origen, destino, fecha]);
    
    console.log(`✅ ${viajes.length} viajes encontrados`);
    res.json(viajes);
  } catch (error) {
    console.error('❌ Error al buscar viajes:', error);
    res.status(500).json({ error: 'Error al buscar viajes' });
  }
});

// Obtener asientos ocupados de un viaje
app.get('/api/viajes/:viajeId/asientos', async (req, res) => {
  try {
    const { viajeId } = req.params;
    console.log(`🪑 Obteniendo asientos ocupados para viaje ${viajeId}`);
    
    const [asientosOcupados] = await db.pool.execute(`
      SELECT asiento 
      FROM PASAJE 
      WHERE viaje_codigo = ? AND estado = 'Vendido'
    `, [viajeId]);
    
    const asientos = asientosOcupados.map(a => a.asiento);
    console.log(`✅ ${asientos.length} asientos ocupados: [${asientos.join(', ')}]`);
    res.json(asientos);
  } catch (error) {
    console.error('❌ Error al obtener asientos:', error);
    res.status(500).json({ error: 'Error al obtener asientos' });
  }
});

// ==========================================
// RUTAS PROTEGIDAS (requieren autenticación)
// ==========================================

// NUEVA RUTA: Procesar compra completa de pasajes
app.post('/api/pasajes/compra-completa', async (req, res) => {
  try {
    console.log('🛒 Procesando compra completa de pasajes...');
    console.log('📦 Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    const datosCompra = req.body;
    
    // Validar datos requeridos
    if (!datosCompra.viaje_codigo || !datosCompra.cliente || !datosCompra.asientos) {
      return res.status(400).json({ 
        error: 'Datos incompletos: se requiere viaje_codigo, cliente y asientos' 
      });
    }
    
    // Procesar la compra
    const resultado = await db.procesarCompraCompleta(datosCompra);
    
    console.log('✅ Compra procesada exitosamente:', resultado);
    
    res.json({
      success: true,
      message: 'Compra procesada exitosamente',
      data: resultado
    });
    
  } catch (error) {
    console.error('❌ Error procesando compra completa:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Error al procesar la compra' 
    });
  }
});

// Vender pasaje (método original mantenido para compatibilidad)
app.post('/api/pasajes', verificarToken, async (req, res) => {
  try {
    const { viaje_codigo, cliente, asientos, metodo_pago } = req.body;
    const usuario_vendedor = req.usuario.codigo;
    
    console.log(`🎫 Vendiendo ${asientos.length} pasajes para viaje ${viaje_codigo}`);
    
    // Registrar cliente si no existe
    let clienteCodigo;
    const [clienteExistente] = await db.pool.execute(`
      SELECT codigo FROM PERSONA WHERE dni = ?
    `, [cliente.dni]);
    
    if (clienteExistente.length > 0) {
      clienteCodigo = clienteExistente[0].codigo;
    } else {
      clienteCodigo = await db.registrarCliente(
        cliente.nombre,
        cliente.apellidos,
        cliente.dni
      );
    }
    
    // Obtener información del viaje
    const [viajeInfo] = await db.pool.execute(`
      SELECT r.costo_referencial 
      FROM VIAJE v
      INNER JOIN RUTAS r ON v.ruta_codigo = r.codigo
      WHERE v.codigo = ?
    `, [viaje_codigo]);
    
    if (viajeInfo.length === 0) {
      return res.status(404).json({ error: 'Viaje no encontrado' });
    }
    
    const costoUnitario = viajeInfo[0].costo_referencial;
    const pasajesCreados = [];
    
    // Crear pasajes para cada asiento
    for (const asiento of asientos) {
      const pasajeCodigo = await db.venderPasaje(
        viaje_codigo,
        clienteCodigo,
        asiento,
        costoUnitario,
        usuario_vendedor
      );
      pasajesCreados.push(pasajeCodigo);
    }
    
    console.log(`✅ ${pasajesCreados.length} pasajes vendidos exitosamente`);
    
    res.json({
      message: 'Pasajes vendidos exitosamente',
      pasajes: pasajesCreados,
      total: costoUnitario * asientos.length
    });
    
  } catch (error) {
    console.error('❌ Error al vender pasaje:', error);
    res.status(500).json({ error: error.message || 'Error al vender pasaje' });
  }
});

// Obtener estadísticas del dashboard
app.get('/api/dashboard/estadisticas', verificarToken, async (req, res) => {
  try {
    console.log('📊 Obteniendo estadísticas del dashboard...');
    const hoy = new Date().toISOString().split('T')[0];
    
    // Ventas del día
    const [ventasHoy] = await db.pool.execute(`
      SELECT 
        COUNT(*) as total_pasajes,
        COALESCE(SUM(importe_pagar), 0) as total_ingresos
      FROM PASAJE 
      WHERE DATE(fecha_emision) = ? AND estado = 'Vendido'
    `, [hoy]);
    
    // Buses operativos
    const [busesOperativos] = await db.pool.execute(`
      SELECT COUNT(*) as total FROM BUSES WHERE estado = 'Operativo'
    `);
    
    // Viajes programados hoy
    const [viajesHoy] = await db.pool.execute(`
      SELECT COUNT(*) as total FROM VIAJE 
      WHERE DATE(fecha_hora_salida) = ? AND estado = 'Programado'
    `, [hoy]);
    
    // Rutas más populares
    const rutasPopulares = await db.obtenerRutasPopulares(5);
    
    const estadisticas = {
      ventas_hoy: {
        pasajeros: ventasHoy[0].total_pasajes,
        ingresos: ventasHoy[0].total_ingresos
      },
      buses_operativos: busesOperativos[0].total,
      viajes_programados: viajesHoy[0].total,
      rutas_populares: rutasPopulares
    };
    
    console.log('✅ Estadísticas obtenidas:', estadisticas);
    res.json(estadisticas);
    
  } catch (error) {
    console.error('❌ Error al obtener estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// Obtener todos los viajes (admin)
app.get('/api/admin/viajes', verificarToken, async (req, res) => {
  try {
    const { fecha, estado } = req.query;
    console.log(`📅 Obteniendo viajes admin - Fecha: ${fecha}, Estado: ${estado}`);
    const viajes = await db.obtenerViajes(fecha);
    res.json(viajes);
  } catch (error) {
    console.error('❌ Error al obtener viajes:', error);
    res.status(500).json({ error: 'Error al obtener viajes' });
  }
});

// Obtener buses
app.get('/api/admin/buses', verificarToken, async (req, res) => {
  try {
    console.log('🚌 Obteniendo lista de buses...');
    const buses = await db.obtenerBuses();
    console.log(`✅ ${buses.length} buses encontrados`);
    res.json(buses);
  } catch (error) {
    console.error('❌ Error al obtener buses:', error);
    res.status(500).json({ error: 'Error al obtener buses' });
  }
});

// ==========================================
// MANEJO DE ERRORES Y SERVIDOR
// ==========================================

// Middleware de manejo de errores
app.use((error, req, res, next) => {
  console.error('❌ Error no manejado:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Ruta 404
app.use('*', (req, res) => {
  console.log(`❓ Endpoint no encontrado: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Iniciar servidor
async function iniciarServidor() {
  try {
    console.log('🚀 Iniciando servidor NORTEEXPRESO...');
    
    // Probar conexión a la base de datos
    const conexionExitosa = await db.testConnection();
    
    if (!conexionExitosa) {
      console.error('❌ No se pudo conectar a la base de datos');
      console.error('💡 Verifica que MySQL esté ejecutándose y las credenciales sean correctas');
      process.exit(1);
    }

    // Inicializar datos de prueba
    await db.initializeTestData();
    
    app.listen(PORT, () => {
      console.log(`🎉 Servidor API ejecutándose en puerto ${PORT}`);
      console.log(`📡 Endpoints disponibles:`);
      console.log(`   POST /api/auth/login`);
      console.log(`   GET  /api/rutas`);
      console.log(`   GET  /api/viajes/buscar`);
      console.log(`   GET  /api/viajes/:id/asientos`);
      console.log(`   POST /api/pasajes/compra-completa`);
      console.log(`   POST /api/pasajes`);
      console.log(`   GET  /api/dashboard/estadisticas`);
      console.log(`   GET  /api/admin/viajes`);
      console.log(`   GET  /api/admin/buses`);
      console.log(`🔗 Frontend URL: http://localhost:5173`);
    });
    
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGINT', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await db.cerrarConexion();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Cerrando servidor...');
  await db.cerrarConexion();
  process.exit(0);
});

// Iniciar servidor si este archivo se ejecuta directamente
if (require.main === module) {
  iniciarServidor();
}

module.exports = app;