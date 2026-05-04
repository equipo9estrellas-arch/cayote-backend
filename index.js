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

    if (!nombre || !telefono || !fecha || !hora || !personas) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Obtener mesas
    const { data: mesas } = await supabase.from("mesas").select("*");

    // Obtener reservas del mismo día
    const { data: reservas } = await supabase
      .from("reservas")
      .select("*")
      .eq("fecha", fecha);

    const reservasHoy = reservas || [];

    // Buscar mesa disponible en esa hora
    const mesaDisponible = mesas.find((mesa) => {
      const ocupada = reservasHoy.some(
        (r) => r.mesa_id === mesa.id && r.hora === hora
      );
      return !ocupada && mesa.capacidad >= personas;
    });

    // SI HAY MESA → RESERVAR
    if (mesaDisponible) {
      const { data, error } = await supabase.from("reservas").insert([
        {
          nombre,
          telefono,
          fecha,
          hora,
          personas,
          alergias: alergias || "ninguna",
          mesa_id: mesaDisponible.id,
        },
      ]);

      if (error) throw error;

      return res.json({ success: true });
    }

    // SI NO HAY → BUSCAR ALTERNATIVAS
    const alternativas = [];
    const horas = [
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "20:00",
      "20:30",
      "21:00",
      "21:30",
      "22:00",
    ];

    for (let h of horas) {
      const disponible = mesas.find((mesa) => {
        const ocupada = reservasHoy.some(
          (r) => r.mesa_id === mesa.id && r.hora === h
        );
        return !ocupada && mesa.capacidad >= personas;
      });

      if (disponible) {
        alternativas.push(h);
      }

      if (alternativas.length >= 3) break;
    }

    return res.json({
      success: false,
      disponible: false,
      alternativas,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
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