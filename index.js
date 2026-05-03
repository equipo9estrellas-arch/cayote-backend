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

app.get("/", (req, res) => {
  res.send("Servidor funcionando");
});

// VER DISPONIBILIDAD (simple y sólido)
app.post("/availability", async (req, res) => {
  try {
    const { fecha, hora, personas } = req.body;

    const { data: mesas } = await supabase.from("mesas").select("*");
    const { data: reservas } = await supabase.from("reservas").select("*");

    const reservasHoy = (reservas || []).filter(
      (r) => r.fecha === fecha && r.hora === hora
    );

    const mesasDisponibles = mesas.filter((mesa) => {
      const ocupada = reservasHoy.some((r) => r.mesa_id === mesa.id);
      return !ocupada && mesa.capacidad >= personas;
    });

    if (mesasDisponibles.length > 0) {
      return res.json({
        disponible: true,
        mesa: mesasDisponibles[0].id,
      });
    }

    return res.json({ disponible: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// RESERVAR (simple y robusto)
app.post("/reservar", async (req, res) => {
  try {
const { nombre, telefono, fecha, hora, personas, alergias } = req.body;
const dia = new Date(fecha).getDay();

const horaNum = parseInt(hora.split(":")[0]);

let permitido = false;

if (dia === 1 || dia === 2) {
  if (horaNum >= 20 && horaNum < 23) permitido = true;
}

if (dia >= 3 && dia <= 6) {
  if (
    (horaNum >= 13 && horaNum < 16) ||
    (horaNum >= 20 && horaNum < 23)
  ) permitido = true;
}

if (dia === 0) {
  if (horaNum >= 13 && horaNum < 16) permitido = true;
}

if (!permitido) {
  return res.status(400).json({
    error: "Restaurante cerrado en ese horario",
  });
}
    const { data: mesas } = await supabase.from("mesas").select("*");
    const { data: reservas } = await supabase.from("reservas").select("*");

    const reservasHoy = (reservas || []).filter(
      (r) => r.fecha === fecha && r.hora === hora
    );

    const mesasDisponibles = mesas.filter((mesa) => {
      const ocupada = reservasHoy.some((r) => r.mesa_id === mesa.id);
      return !ocupada && mesa.capacidad >= personas;
    });

    if (mesasDisponibles.length === 0) {
      return res.status(400).json({ error: "No hay mesas disponibles" });
    }

    const mesaAsignada = mesasDisponibles[0];

    const { data, error } = await supabase
      .from("reservas")
      .insert([
        {
          nombre,
          telefono,
          fecha,
          hora,
          personas,
          mesa_id: mesaAsignada.id,
        },
      ])
      .select();

    if (error) throw error;

    return res.json({
      success: true,
      mesa: mesaAsignada.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ESTADO DE MESAS (para frontend tipo Restoo)
app.post("/estado-mesas", async (req, res) => {
  try {
    const { fecha, hora } = req.body;

    const { data: mesas } = await supabase.from("mesas").select("*");
    const { data: reservas } = await supabase.from("reservas").select("*");

    const estado = mesas.map((mesa) => {
      const ocupada = (reservas || []).some(
        (r) =>
          r.mesa_id === mesa.id &&
          r.fecha === fecha &&
          r.hora === hora
      );

      return {
        mesa_id: mesa.id,
        capacidad: mesa.capacidad,
        ocupada,
      };
    });

    res.json(estado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor activo en puerto " + PORT);
});
app.post("/disponibilidad", async (req, res) => {
  try {
    const { fecha, hora, personas } = req.body;

    if (!fecha || !hora || !personas) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    const { data: mesas } = await supabase
      .from("mesas")
      .select("*");

    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha)
      .eq("hora", hora);

    const reservasHoy = reservas || [];

    const mesasDisponibles = mesas.filter((mesa) => {
      const ocupada = reservasHoy.some(
        (r) => r.mesa_id === mesa.id
      );
      return !ocupada && mesa.capacidad >= personas;
    });

    return res.json({
      disponible: mesasDisponibles.length > 0,
      mesas_disponibles: mesasDisponibles.length
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});