// Configuração do Supabase
// Esta chave é a chave pública (Publishable/anon) do projeto.
const SUPABASE_URL = "https://oipbdwctkkhsibqtitmy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NB8Zj3BupM5huL9uiS1LkQ_8sYLB_yp";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);