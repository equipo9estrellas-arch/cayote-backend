require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// HEALTH CHECK
app.get("/", (req, res) => {
  res.send("Servidor funcionando");
});

// OBTENER MESAS
app.get("/mesas", async (req, res) => {
  const { data, error } = await supabase.from("mesas").select("*");
  if (error) return res.status(500).json({ error });
  res.json(data);
});

// LISTAR RESERVAS
app.get("/reservas", async (req, res) => {
  const { data, error } = await supabase
    .from("reservas")
    .select("*")
    .order("hora", { ascending: true });

  if (error) return res.status(500).json({ error });
  res.json(data);
});

// ESTADO DE MESAS (CLAVE PARA FRONTEND)
app.post("/estado-mesas", async (req, res) => {
  try {
    const { fecha, hora } = req.body;

    const [h, m] = hora.split(":").map(Number);
    const horaActual = h * 60 + m;

    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha)
      .eq("estado", "confirmada");

    const { data: mesas } = await supabase.from("mesas").select("*");

    const resultado = mesas.map((mesa) => {
      let ocupada = false;

      for (const r of reservas) {
        if (r.mesa_id !== mesa.id) continue;

        const [rh, rm] = r.hora.split(":").map(Number);
        const inicio = rh * 60 + rm;
        const fin = inicio + (r.duracion_minutos || 90);

        if (horaActual >= inicio && horaActual < fin) {
          ocupada = true;
          break;
        }
      }

      return {
        mesa_id: mesa.id,
        capacidad: mesa.capacidad,
        ocupada,
      };
    });

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DISPONIBILIDAD
app.post("/availability", async (req, res) => {
  try {
    const { fecha, hora, personas } = req.body;

    const [h, m] = hora.split(":").map(Number);
    const horaActual = h * 60 + m;

    const { data: mesas } = await supabase
      .from("mesas")
      .select("*")
      .gte("capacidad", personas);

    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha)
      .eq("estado", "confirmada");

    for (const mesa of mesas) {
      let ocupada = false;

      for (const r of reservas) {
        if (r.mesa_id !== mesa.id) continue;

        const [rh, rm] = r.hora.split(":").map(Number);
        const inicio = rh * 60 + rm;
        const fin = inicio + (r.duracion_minutos || 90);

        if (horaActual >= inicio && horaActual < fin) {
          ocupada = true;
          break;
        }
      }

      if (!ocupada) {
        return res.json({
          disponible: true,
          mesa_id: mesa.id,
        });
      }
    }

    res.json({ disponible: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RESERVAR (ANTI-OVERBOOKING REAL)
app.post("/reservar", async (req, res) => {
  try {
    const { nombre, telefono, fecha, hora, personas } = req.body;

    // convertir hora inicio
    const [h, m] = hora.split(":").map(Number);
    const inicioNueva = h * 60 + m;

    // duración fija 90 min
    const finNueva = inicioNueva + 90;

    // 1. obtener mesas
    const { data: mesas } = await supabase
      .from("mesas")
      .select("*")
      .order("capacidad", { ascending: false });

    // 2. reservas del día
    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha);

    // 3. relaciones mesas-reservas
    const { data: reservasMesas } = await supabase
      .from("reservas_mesas")
      .select("*");

    // 4. filtrar mesas libres
    const mesasLibres = mesas.filter((mesa) => {
      const rel = reservasMesas.filter(rm => rm.mesa_id === mesa.id);

      for (const r of rel) {
        const reserva = reservas.find(res => res.id === r.reserva_id);
        if (!reserva) continue;

        const [hi, mi] = reserva.hora_inicio.split(":").map(Number);
        const inicio = hi * 60 + mi;

        const [hf, mf] = reserva.hora_fin.split(":").map(Number);
        const fin = hf * 60 + mf;

        if (inicioNueva < fin && finNueva > inicio) {
          return false;
        }
      }

      return true;
    });

    // 5. elegir mesas (multimesa)
    let seleccion = [];
    let capacidadTotal = 0;

    for (const mesa of mesasLibres) {
      seleccion.push(mesa);
      capacidadTotal += mesa.capacidad;

      if (capacidadTotal >= personas) break;
    }

    if (capacidadTotal < personas) {
      return res.json({ error: "No hay capacidad suficiente" });
    }

    // 6. calcular hora_fin
    const finHora = new Date(0,0,0,h,m);
    finHora.setMinutes(finHora.getMinutes() + 90);

    const hora_fin = finHora.toTimeString().slice(0,5);

    // 7. crear reserva
    const { data: nuevaReserva, error } = await supabase
      .from("reservas")
      .insert([
        {
          nombre,
          telefono,
          fecha,
          hora_inicio: hora,
          hora_fin,
          personas
        }
      ])
      .select()
      .single();

    if (error) throw error;

    // 8. insertar relación mesas
    const inserts = seleccion.map(m => ({
      reserva_id: nuevaReserva.id,
      mesa_id: m.id
    }));

    await supabase.from("reservas_mesas").insert(inserts);

    res.json({
      success: true,
      mesas: seleccion.map(m => m.nombre)
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});