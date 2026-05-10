export const MOCK_DATA = {
  dashboard: {
    welcome: "Bienvenido, Director. Brain Core está operativa al 100%.",
    metrics: [
      { id: 1, label: "Proyectos Activos", value: "3", change: "+1", trend: "up" },
      { id: 2, label: "Tareas Pendientes", value: "12", change: "-2", trend: "down" },
      { id: 3, label: "ROI Estimado", value: "$12.4k", change: "+8%", trend: "up" },
      { id: 4, label: "Horas Ahorradas", value: "48h", change: "+12%", trend: "up" },
    ],
    news: [
      { id: 1, title: "Nuevo Modelo Gemini 1.5 Pro Integrado", date: "Hace 2h", category: "System" },
      { id: 2, title: "Reporte Mensual Generado: SunPartners", date: "Ayer", category: "Report" },
      { id: 3, title: "Alerta de Tendencia: TikTok SEO", date: "Hace 3d", category: "Insight" },
    ]
  },
  tasks: [
    {
      id: 1,
      pendiente: "Auditoría SEO Técnico",
      cliente: "SunPartners",
      responsable: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
      fecha_entrega: "19/02",
      estado: "En Proceso",
      isPriority: true
    },
    {
      id: 2,
      pendiente: "Redacción Blog Post (x4)",
      cliente: "TechFlow",
      responsable: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
      fecha_entrega: "20/02",
      estado: "Pendiente",
      isPriority: false
    },
    {
      id: 3,
      pendiente: "Campaña Ads Q4",
      cliente: "Urban Coffee",
      responsable: "https://i.pravatar.cc/150?u=a04258114e29026302d",
      fecha_entrega: "28/10",
      estado: "Realizado",
      isPriority: true
    },
    {
      id: 4,
      pendiente: "Diseño Creativos RRSS",
      cliente: "Dr. Smile",
      responsable: "https://i.pravatar.cc/150?u=a048581f4e29026701d",
      fecha_entrega: "01/11",
      estado: "Pendiente",
      isPriority: false
    },
    {
      id: 5,
      pendiente: "Keyword Research",
      cliente: "SunPartners",
      responsable: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
      fecha_entrega: "02/11",
      estado: "En Proceso",
      isPriority: true
    },
    {
      id: 6,
      pendiente: "Setup Analytics GA4",
      cliente: "Velvet Hotel",
      responsable: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
      fecha_entrega: "20/10",
      estado: "Realizado",
      isPriority: false
    },
    {
      id: 7,
      pendiente: "Propuesta Rediseño Web",
      cliente: "TechFlow",
      responsable: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
      fecha_entrega: "30/10",
      estado: "Pendiente",
      isPriority: true
    },
    {
      id: 8,
      pendiente: "Estrategia Email Marketing",
      cliente: "Urban Coffee",
      responsable: "https://i.pravatar.cc/150?u=a04258114e29026302d",
      fecha_entrega: "25/10",
      estado: "Pendiente",
      isPriority: false
    },
  ],
  chat: [
    {
      id: 1,
      role: "user",
      content: "Brain Core, necesito un análisis rápido de la competencia para SunPartners."
    },
    {
      id: 2,
      role: "assistant",
      content: "Entendido. He analizado a los 3 principales competidores en el sector de energía solar residencial.\n\n**Hallazgos Clave:**\n\n1.  **SolarMax:** Fuerte presencia en YouTube, débil en SEO local.\n2.  **EcoEnergy:** Precios agresivos, pero malas reseñas en Google Maps (3.2 estrellas).\n3.  **GreenPower:** Excelente blog de contenidos, capturando tráfico informacional.\n\n¿Te gustaría que profundice en la estrategia de contenidos de GreenPower o prepare una tabla comparativa de precios?"
    },
    {
      id: 3,
      role: "user",
      content: "Dame la tabla comparativa, por favor. Y enfócate en los precios de instalación."
    },
  ],
  files: [
    { id: 1, name: "Brand_Guidelines_v2.pdf", size: "4.2 MB", type: "pdf", date: "Oct 12" },
    { id: 2, name: "Q4_Strategy_Deck.pptx", size: "12.5 MB", type: "ppt", date: "Oct 15" },
    { id: 3, name: "Logo_Pack_Final.zip", size: "28.1 MB", type: "zip", date: "Oct 10" },
    { id: 4, name: "Contract_SunPartners.pdf", size: "1.2 MB", type: "pdf", date: "Sep 28" },
    { id: 5, name: "Competitor_Analysis.xlsx", size: "850 KB", type: "xls", date: "Oct 20" },
    { id: 6, name: "Social_Media_Assets.folder", size: "14 Items", type: "folder", date: "Oct 22" },
    { id: 7, name: "Invoice_Oct_2023.pdf", size: "150 KB", type: "pdf", date: "Nov 01" },
    { id: 8, name: "Meeting_Notes_Kickoff.docx", size: "45 KB", type: "doc", date: "Sep 15" },
  ]
};
