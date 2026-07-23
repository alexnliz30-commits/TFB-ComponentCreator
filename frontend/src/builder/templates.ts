import type { BuilderBlock } from './types';

export interface Template {
  id: string;
  label: string;
  description: string;
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'landing',
    label: 'Landing Page',
    description: 'Hero, features y CTA',
    blocks: {
      'block-t1': { id: 'block-t1', type: 'section', props: { className: 'text-center py-16 px-6 bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-xl' }, children: ['block-t2', 'block-t3', 'block-t4'] },
      'block-t2': { id: 'block-t2', type: 'h1', props: { text: 'Construye interfaces increíbles', className: 'text-4xl font-bold text-white' }, children: [] },
      'block-t3': { id: 'block-t3', type: 'p', props: { text: 'La forma más rápida de crear componentes UI con inteligencia artificial.', className: 'text-lg text-blue-100 mt-4 max-w-2xl mx-auto' }, children: [] },
      'block-t4': { id: 'block-t4', type: 'button', props: { text: 'Empieza gratis', className: 'mt-8 bg-white text-blue-700 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 text-sm' }, children: [] },
      'block-t5': { id: 'block-t5', type: 'section', props: { className: 'py-12 px-6' }, children: ['block-t6', 'block-t7'] },
      'block-t6': { id: 'block-t6', type: 'h2', props: { text: 'Características', className: 'text-2xl font-bold text-center mb-8' }, children: [] },
      'block-t7': { id: 'block-t7', type: 'grid', props: { cols: '3', gap: '6', className: '' }, children: ['block-t8', 'block-t9', 'block-t10'] },
      'block-t8': { id: 'block-t8', type: 'card', props: { className: 'bg-white rounded-xl shadow-sm border p-6 text-center' }, children: ['block-t11', 'block-t12'] },
      'block-t9': { id: 'block-t9', type: 'card', props: { className: 'bg-white rounded-xl shadow-sm border p-6 text-center' }, children: ['block-t13', 'block-t14'] },
      'block-t10': { id: 'block-t10', type: 'card', props: { className: 'bg-white rounded-xl shadow-sm border p-6 text-center' }, children: ['block-t15', 'block-t16'] },
      'block-t11': { id: 'block-t11', type: 'h3', props: { text: 'Drag & Drop', className: 'text-lg font-semibold' }, children: [] },
      'block-t12': { id: 'block-t12', type: 'p', props: { text: 'Arrastra componentes desde la paleta y compón tu interfaz visualmente.', className: 'text-sm text-slate-500 mt-2' }, children: [] },
      'block-t13': { id: 'block-t13', type: 'h3', props: { text: 'IA Integrada', className: 'text-lg font-semibold' }, children: [] },
      'block-t14': { id: 'block-t14', type: 'p', props: { text: 'Genera y refina componentes mediante conversación con GPT-4o.', className: 'text-sm text-slate-500 mt-2' }, children: [] },
      'block-t15': { id: 'block-t15', type: 'h3', props: { text: 'Código Limpio', className: 'text-lg font-semibold' }, children: [] },
      'block-t16': { id: 'block-t16', type: 'p', props: { text: 'Exporta React + Tailwind listo para producción.', className: 'text-sm text-slate-500 mt-2' }, children: [] },
      'block-t17': { id: 'block-t17', type: 'cta', props: { title: '¿Listo para empezar?', text: 'Crea tu primer componente en menos de un minuto.', buttonText: 'Crear cuenta', className: '' }, children: [] },
    },
    rootIds: ['block-t1', 'block-t5', 'block-t17'],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Stats, tabla y progreso',
    blocks: {
      'block-d1': { id: 'block-d1', type: 'h2', props: { text: 'Panel de control', className: 'text-2xl font-bold' }, children: [] },
      'block-d2': { id: 'block-d2', type: 'grid', props: { cols: '3', gap: '4', className: '' }, children: ['block-d3', 'block-d4', 'block-d5'] },
      'block-d3': { id: 'block-d3', type: 'stat', props: { label: 'Usuarios activos', value: '2,847', change: '+12.5%', className: '' }, children: [] },
      'block-d4': { id: 'block-d4', type: 'stat', props: { label: 'Ingresos', value: '€ 48,200', change: '+8.2%', className: '' }, children: [] },
      'block-d5': { id: 'block-d5', type: 'stat', props: { label: 'Conversión', value: '3.6%', change: '-0.4%', className: '' }, children: [] },
      'block-d6': { id: 'block-d6', type: 'grid', props: { cols: '2', gap: '4', className: '' }, children: ['block-d7', 'block-d8'] },
      'block-d7': { id: 'block-d7', type: 'card', props: { className: 'bg-white rounded-xl shadow-sm border p-5' }, children: ['block-d9', 'block-d10'] },
      'block-d8': { id: 'block-d8', type: 'card', props: { className: 'bg-white rounded-xl shadow-sm border p-5' }, children: ['block-d11', 'block-d12', 'block-d13'] },
      'block-d9': { id: 'block-d9', type: 'h3', props: { text: 'Últimos usuarios', className: 'text-sm font-semibold mb-3' }, children: [] },
      'block-d10': { id: 'block-d10', type: 'table-ui', props: { headers: 'Nombre,Email,Rol', rows: 'María García:admin@mail.com:Admin,Juan López:juan@mail.com:Editor,Ana Ruiz:ana@mail.com:Viewer', className: '' }, children: [] },
      'block-d11': { id: 'block-d11', type: 'h3', props: { text: 'Progreso del mes', className: 'text-sm font-semibold mb-3' }, children: [] },
      'block-d12': { id: 'block-d12', type: 'progress', props: { value: '72', label: 'Objetivo de ventas', className: '' }, children: [] },
      'block-d13': { id: 'block-d13', type: 'progress', props: { value: '45', label: 'Nuevos registros', className: '' }, children: [] },
    },
    rootIds: ['block-d1', 'block-d2', 'block-d6'],
  },
  {
    id: 'form',
    label: 'Formulario',
    description: 'Registro con validación',
    blocks: {
      'block-f1': { id: 'block-f1', type: 'card', props: { className: 'bg-white rounded-xl shadow-sm border p-8 max-w-md mx-auto' }, children: ['block-f2', 'block-f3', 'block-f4', 'block-f5', 'block-f6', 'block-f7', 'block-f8', 'block-f9'] },
      'block-f2': { id: 'block-f2', type: 'h2', props: { text: 'Crear cuenta', className: 'text-xl font-bold text-center' }, children: [] },
      'block-f3': { id: 'block-f3', type: 'p', props: { text: 'Introduce tus datos para registrarte.', className: 'text-sm text-slate-500 text-center mb-6' }, children: [] },
      'block-f4': { id: 'block-f4', type: 'input', props: { label: 'Nombre completo', placeholder: 'Ej: María García', inputType: 'text', className: 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500' }, children: [] },
      'block-f5': { id: 'block-f5', type: 'input', props: { label: 'Correo electrónico', placeholder: 'tu@email.com', inputType: 'email', className: 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500' }, children: [] },
      'block-f6': { id: 'block-f6', type: 'input', props: { label: 'Contraseña', placeholder: 'Mínimo 8 caracteres', inputType: 'password', className: 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500' }, children: [] },
      'block-f7': { id: 'block-f7', type: 'checkbox', props: { label: 'Acepto los términos y condiciones', className: '' }, children: [] },
      'block-f8': { id: 'block-f8', type: 'button', props: { text: 'Crear cuenta', className: 'w-full bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm' }, children: [] },
      'block-f9': { id: 'block-f9', type: 'p', props: { text: '¿Ya tienes cuenta? Inicia sesión', className: 'text-xs text-slate-500 text-center mt-4' }, children: [] },
    },
    rootIds: ['block-f1'],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    description: 'Tabla de precios con 3 planes',
    blocks: {
      'block-p1': { id: 'block-p1', type: 'section', props: { className: 'text-center py-8' }, children: ['block-p2', 'block-p3'] },
      'block-p2': { id: 'block-p2', type: 'h2', props: { text: 'Planes y precios', className: 'text-3xl font-bold' }, children: [] },
      'block-p3': { id: 'block-p3', type: 'p', props: { text: 'Elige el plan que mejor se adapte a tus necesidades.', className: 'text-slate-500 mt-2' }, children: [] },
      'block-p4': { id: 'block-p4', type: 'grid', props: { cols: '3', gap: '6', className: '' }, children: ['block-p5', 'block-p8', 'block-p12'] },
      'block-p5': { id: 'block-p5', type: 'card', props: { className: 'bg-white rounded-xl border p-6 text-center' }, children: ['block-p6', 'block-p16', 'block-p7', 'block-p17'] },
      'block-p6': { id: 'block-p6', type: 'h3', props: { text: 'Básico', className: 'text-lg font-semibold' }, children: [] },
      'block-p16': { id: 'block-p16', type: 'h2', props: { text: '€0/mes', className: 'text-3xl font-bold mt-4' }, children: [] },
      'block-p7': { id: 'block-p7', type: 'ul', props: { items: '5 componentes,1 proyecto,Soporte email', className: 'list-none space-y-2 text-sm text-slate-600 mt-4' }, children: [] },
      'block-p17': { id: 'block-p17', type: 'button', props: { text: 'Empezar', className: 'mt-6 w-full border border-slate-300 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm hover:bg-slate-50' }, children: [] },
      'block-p8': { id: 'block-p8', type: 'card', props: { className: 'bg-blue-600 rounded-xl border-2 border-blue-600 p-6 text-center text-white shadow-xl' }, children: ['block-p9', 'block-p18', 'block-p10', 'block-p11'] },
      'block-p9': { id: 'block-p9', type: 'h3', props: { text: 'Pro', className: 'text-lg font-semibold text-white' }, children: [] },
      'block-p18': { id: 'block-p18', type: 'h2', props: { text: '€29/mes', className: 'text-3xl font-bold mt-4 text-white' }, children: [] },
      'block-p10': { id: 'block-p10', type: 'ul', props: { items: 'Componentes ilimitados,10 proyectos,Soporte prioritario,IA avanzada', className: 'list-none space-y-2 text-sm text-blue-100 mt-4' }, children: [] },
      'block-p11': { id: 'block-p11', type: 'button', props: { text: 'Elegir Pro', className: 'mt-6 w-full bg-white text-blue-700 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-blue-50' }, children: [] },
      'block-p12': { id: 'block-p12', type: 'card', props: { className: 'bg-white rounded-xl border p-6 text-center' }, children: ['block-p13', 'block-p19', 'block-p14', 'block-p15'] },
      'block-p13': { id: 'block-p13', type: 'h3', props: { text: 'Enterprise', className: 'text-lg font-semibold' }, children: [] },
      'block-p19': { id: 'block-p19', type: 'h2', props: { text: 'Contacto', className: 'text-3xl font-bold mt-4' }, children: [] },
      'block-p14': { id: 'block-p14', type: 'ul', props: { items: 'Todo lo de Pro,Proyectos ilimitados,SLA dedicado,SSO/SAML', className: 'list-none space-y-2 text-sm text-slate-600 mt-4' }, children: [] },
      'block-p15': { id: 'block-p15', type: 'button', props: { text: 'Contactar', className: 'mt-6 w-full border border-slate-300 text-slate-700 font-medium px-4 py-2 rounded-lg text-sm hover:bg-slate-50' }, children: [] },
    },
    rootIds: ['block-p1', 'block-p4'],
  },
];
