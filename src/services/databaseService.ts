// Servicio para operaciones de base de datos - Actualizado
export interface PasajeData {
  viaje_codigo: number;
  cliente: {
    nombre: string;
    apellidos: string;
    dni: string;
    telefono?: string;
    email?: string;
  };
  asientos: number[];
  metodo_pago: string;
  telefono_contacto: string;
  viaja_con_mascota?: boolean;
  tipo_mascota?: string;
  nombre_mascota?: string;
  peso_mascota?: number;
  tutor_nombre?: string;
  tutor_dni?: string;
  permiso_notarial?: boolean;
}

export interface ViajeData {
  ruta_codigo: number;
  bus_codigo: number;
  chofer_codigo: number;
  fecha_hora_salida: string;
  fecha_hora_llegada_estimada: string;
}

class DatabaseService {
  private baseUrl = 'http://localhost:3001/api';

  async guardarPasaje(pasajeData: PasajeData): Promise<{ success: boolean; pasajes?: number[]; error?: string }> {
    try {
      console.log('🛒 Enviando datos de compra al servidor:', pasajeData);

      // Preparar datos para el nuevo endpoint
      const datosCompra = {
        viaje_codigo: pasajeData.viaje_codigo,
        cliente: pasajeData.cliente,
        asientos: pasajeData.asientos,
        metodo_pago: pasajeData.metodo_pago,
        datosAdicionales: {
          telefono_contacto: pasajeData.telefono_contacto,
          viaja_con_mascota: pasajeData.viaja_con_mascota,
          tipo_mascota: pasajeData.tipo_mascota,
          nombre_mascota: pasajeData.nombre_mascota,
          peso_mascota: pasajeData.peso_mascota,
          tutor_nombre: pasajeData.tutor_nombre,
          tutor_dni: pasajeData.tutor_dni,
          permiso_notarial: pasajeData.permiso_notarial,
          metodo_pago: pasajeData.metodo_pago
        }
      };

      const response = await fetch(`${this.baseUrl}/pasajes/compra-completa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(datosCompra)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('✅ Compra procesada exitosamente:', result);
        return { 
          success: true, 
          pasajes: result.data.pasajes 
        };
      } else {
        console.error('❌ Error en la respuesta del servidor:', result);
        return { 
          success: false, 
          error: result.error || 'Error al procesar la compra' 
        };
      }
    } catch (error) {
      console.error('❌ Error de conexión:', error);
      return { 
        success: false, 
        error: 'Error de conexión con el servidor. Verifica que el servidor esté ejecutándose.' 
      };
    }
  }

  async obtenerViajes(filtros: {
    origen: string;
    destino: string;
    fecha: string;
  }): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        origen: filtros.origen,
        destino: filtros.destino,
        fecha: filtros.fecha
      });

      console.log(`🔍 Buscando viajes: ${filtros.origen} → ${filtros.destino} el ${filtros.fecha}`);

      const response = await fetch(`${this.baseUrl}/viajes/buscar?${params}`);
      
      if (response.ok) {
        const viajes = await response.json();
        console.log(`✅ ${viajes.length} viajes encontrados`);
        return viajes;
      } else {
        console.error('❌ Error obteniendo viajes:', response.statusText);
        return [];
      }
    } catch (error) {
      console.error('❌ Error de conexión obteniendo viajes:', error);
      return [];
    }
  }

  async obtenerAsientosOcupados(viajeId: number): Promise<number[]> {
    try {
      console.log(`🪑 Obteniendo asientos ocupados para viaje ${viajeId}`);
      
      const response = await fetch(`${this.baseUrl}/viajes/${viajeId}/asientos`);
      
      if (response.ok) {
        const asientos = await response.json();
        console.log(`✅ ${asientos.length} asientos ocupados: [${asientos.join(', ')}]`);
        return asientos;
      } else {
        console.error('❌ Error obteniendo asientos:', response.statusText);
        return [];
      }
    } catch (error) {
      console.error('❌ Error de conexión obteniendo asientos:', error);
      return [];
    }
  }

  async obtenerRutas(): Promise<any[]> {
    try {
      console.log('📍 Obteniendo rutas disponibles...');
      
      const response = await fetch(`${this.baseUrl}/rutas`);
      
      if (response.ok) {
        const rutas = await response.json();
        console.log(`✅ ${rutas.length} rutas encontradas`);
        return rutas;
      } else {
        console.error('❌ Error obteniendo rutas:', response.statusText);
        return [];
      }
    } catch (error) {
      console.error('❌ Error de conexión obteniendo rutas:', error);
      return [];
    }
  }

  async registrarCliente(clienteData: {
    nombre: string;
    apellidos: string;
    dni: string;
    telefono?: string;
    email?: string;
  }): Promise<{ success: boolean; clienteId?: number; error?: string }> {
    try {
      console.log('👤 Registrando cliente:', clienteData);

      const response = await fetch(`${this.baseUrl}/clientes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(clienteData)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Cliente registrado exitosamente:', result);
        return { success: true, clienteId: result.clienteId };
      } else {
        const error = await response.json();
        console.error('❌ Error registrando cliente:', error);
        return { success: false, error: error.message || 'Error al registrar cliente' };
      }
    } catch (error) {
      console.error('❌ Error de conexión registrando cliente:', error);
      return { success: false, error: 'Error de conexión con el servidor' };
    }
  }

  async obtenerEstadisticas(): Promise<any> {
    try {
      const token = localStorage.getItem('norteexpreso_token');
      const response = await fetch(`${this.baseUrl}/dashboard/estadisticas`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const estadisticas = await response.json();
        return estadisticas;
      } else {
        console.error('❌ Error obteniendo estadísticas:', response.statusText);
        return null;
      }
    } catch (error) {
      console.error('❌ Error de conexión obteniendo estadísticas:', error);
      return null;
    }
  }

  // Método para probar la conexión con el servidor
  async probarConexion(): Promise<boolean> {
    try {
      console.log('🔗 Probando conexión con el servidor...');
      
      const response = await fetch(`${this.baseUrl}/rutas`);
      
      if (response.ok) {
        console.log('✅ Conexión con el servidor exitosa');
        return true;
      } else {
        console.error('❌ Error de conexión con el servidor:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ No se pudo conectar con el servidor:', error);
      return false;
    }
  }
}

export const databaseService = new DatabaseService();