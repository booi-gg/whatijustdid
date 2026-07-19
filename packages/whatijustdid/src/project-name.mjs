import { getAgent, validateAgentConfig } from "./agents/index.mjs";

export const DISH_NAMES = Object.freeze([
  "Jollof Rice",
  "Bibimbap",
  "Laksa",
  "Pierogi",
  "Shakshuka",
  "Feijoada",
  "Ceviche",
  "Khachapuri",
  "Doro Wat",
  "Biryani",
  "Arepas",
  "Moussaka",
  "Tagine",
  "Phở",
  "Goulash",
  "Chicken Adobo",
  "Ramen",
  "Paella",
  "Poutine",
  "Tom Yum",
  "Bobotie",
  "Rendang",
  "Koshari",
  "Lomo Saltado",
  "Satay",
  "Dolma",
  "Pelmeni",
  "Hainanese Chicken Rice",
  "Bunny Chow",
  "Gumbo",
  "Moqueca",
  "Mantı",
  "Fesenjan",
  "Chivito",
  "Khinkali",
  "Okonomiyaki",
  "Nasi Goreng",
  "Tteokbokki",
  "Ful Medames",
  "Miso Katsu",
  "Khao Soi",
  "Couscous",
  "Sancocho",
  "Sauerbraten",
  "Bánh Mì",
  "Ćevapi",
  "Katsu Curry",
  "Mole Poblano",
  "Nihari",
  "Sinigang",
  "Tavë Kosi",
  "Wiener Schnitzel",
  "Zürcher Geschnetzeltes",
  "Machboos",
  "Kabsa",
  "Plov",
  "Chakalaka",
  "Empanadas",
  "Pupusas",
  "Tourtière",
  "Bo Kho",
  "Currywurst",
  "Fish Amok",
  "Lahmacun",
  "Matambre",
  "Nacatamales",
  "Oyakodon",
  "Pastitsio",
  "Quiche Lorraine",
  "Rösti",
  "Sopa de Lima",
  "Thieboudienne",
  "Vatapá",
  "Waakye",
  "Xiaolongbao",
  "Yassa",
  "Zaalouk",
]);

/** Pick and persist a memorable first-run name without making init depend on AI. */
export async function chooseProjectName(config, dependencies = {}) {
  const random = dependencies.random ?? Math.random;
  const fallback = randomDishName(random);
  let nameProject = dependencies.nameProject;

  if (!nameProject) {
    const validate = dependencies.validateAgentConfig ?? validateAgentConfig;
    const validation = validate(config.agent);
    if (!validation.valid) return { name: fallback, source: "list" };

    const resolveAgent = dependencies.getAgent ?? getAgent;
    const agent = resolveAgent(config.agent);
    if (typeof agent.nameProject !== "function") {
      return { name: fallback, source: "list" };
    }
    nameProject = agent.nameProject;
  }

  try {
    const generated = await nameProject(
      {
        randomCue: fallback,
      },
      {
        model: config.model,
        timeoutMs: Math.min(config.timeoutMs ?? 20_000, 10_000),
      },
    );
    const name = normalizeProjectName(generated?.name ?? generated);
    return name
      ? { name, source: config.agent }
      : { name: fallback, source: "list" };
  } catch {
    return { name: fallback, source: "list" };
  }
}

export function randomDishName(random = Math.random) {
  const value = Number(random());
  const index = Number.isFinite(value)
    ? Math.min(
        DISH_NAMES.length - 1,
        Math.max(0, Math.floor(value * DISH_NAMES.length)),
      )
    : 0;
  return DISH_NAMES[index];
}

export function normalizeProjectName(value) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name && name.length <= 80 ? name : null;
}
