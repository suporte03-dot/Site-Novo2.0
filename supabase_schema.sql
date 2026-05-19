-- ==========================================
-- SCRIPT DE CRIAÇÃO DO BANCO SUPABASE
-- Execute este script no SQL Editor do Supabase
-- ==========================================

-- Habilitar a extensão pgcrypto (já padrão no Supabase, mas por garantia)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. CRIAÇÃO DAS TABELAS

CREATE TABLE grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE membros_grupo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  papel TEXT DEFAULT 'membro',
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(grupo_id, usuario_id)
);

CREATE TABLE lancamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  vencimento DATE NOT NULL,
  status TEXT NOT NULL,
  forma_pagamento TEXT,
  responsavel TEXT,
  observacao TEXT,
  criado_por UUID REFERENCES auth.users(id),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(grupo_id, nome)
);

CREATE TABLE metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  mes_referencia TEXT NOT NULL,
  valor_meta NUMERIC NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(grupo_id, mes_referencia)
);

CREATE TABLE orcamentos_categoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  mes_referencia TEXT NOT NULL,
  limite_valor NUMERIC NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(grupo_id, categoria, mes_referencia)
);

CREATE TABLE planejamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor_previsto NUMERIC NOT NULL,
  data_prevista DATE NOT NULL,
  observacao TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE recorrencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  dia_vencimento INTEGER NOT NULL,
  forma_pagamento TEXT,
  responsavel TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE parcelamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor_total NUMERIC NOT NULL,
  quantidade_parcelas INTEGER NOT NULL,
  categoria TEXT NOT NULL,
  forma_pagamento TEXT,
  responsavel TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. HABILITAR ROW LEVEL SECURITY (RLS)

ALTER TABLE grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE membros_grupo ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos_categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE planejamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelamentos ENABLE ROW LEVEL SECURITY;

-- 3. FUNÇÃO DE APOIO PARA VERIFICAÇÃO DE GRUPO

CREATE OR REPLACE FUNCTION is_member_of(g_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM membros_grupo 
    WHERE grupo_id = g_id AND usuario_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. POLÍTICAS DE ACESSO (POLICIES)

-- Grupos: O usuário pode ver grupos que ele faz parte. E criar novos.
CREATE POLICY "Membros veem seus grupos" ON grupos FOR SELECT USING (id IN (SELECT grupo_id FROM membros_grupo WHERE usuario_id = auth.uid()));
CREATE POLICY "Usuarios criam grupos" ON grupos FOR INSERT WITH CHECK (criado_por = auth.uid());
CREATE POLICY "Criadores editam grupos" ON grupos FOR UPDATE USING (criado_por = auth.uid());

-- Membros_grupo: Pode ver quem está no mesmo grupo. Pode se associar a um grupo se souber o ID.
CREATE POLICY "Membros veem outros membros" ON membros_grupo FOR SELECT USING (grupo_id IN (SELECT grupo_id FROM membros_grupo WHERE usuario_id = auth.uid()));
CREATE POLICY "Qualquer um logado cria associação inicial" ON membros_grupo FOR INSERT WITH CHECK (auth.uid() = usuario_id);

-- Restantes: Acesso Total (CRUD) apenas se for membro do grupo especificado
CREATE POLICY "Acesso lancamentos" ON lancamentos FOR ALL USING (is_member_of(grupo_id)) WITH CHECK (is_member_of(grupo_id));
CREATE POLICY "Acesso categorias" ON categorias FOR ALL USING (is_member_of(grupo_id)) WITH CHECK (is_member_of(grupo_id));
CREATE POLICY "Acesso metas" ON metas FOR ALL USING (is_member_of(grupo_id)) WITH CHECK (is_member_of(grupo_id));
CREATE POLICY "Acesso orcamentos" ON orcamentos_categoria FOR ALL USING (is_member_of(grupo_id)) WITH CHECK (is_member_of(grupo_id));
CREATE POLICY "Acesso planejamentos" ON planejamentos FOR ALL USING (is_member_of(grupo_id)) WITH CHECK (is_member_of(grupo_id));
CREATE POLICY "Acesso recorrencias" ON recorrencias FOR ALL USING (is_member_of(grupo_id)) WITH CHECK (is_member_of(grupo_id));
CREATE POLICY "Acesso parcelamentos" ON parcelamentos FOR ALL USING (is_member_of(grupo_id)) WITH CHECK (is_member_of(grupo_id));

-- 5. TRIGGER DE ATUALIZAÇÃO (UPDATED_AT)

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_lancamentos_updated_at
BEFORE UPDATE ON lancamentos
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Habilitar Realtime para as tabelas principais
ALTER PUBLICATION supabase_realtime ADD TABLE lancamentos, categorias, metas, orcamentos_categoria, planejamentos, recorrencias, parcelamentos;

-- FIM DO SCRIPT
