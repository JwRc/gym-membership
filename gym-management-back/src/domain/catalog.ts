/** Catálogo padrão de modalidades — igual para todas as academias. */
/** color2: segunda cor opcional (faixa bicolor). */
type L = [name: string, color: string, minMonths: number | null, minClasses: number | null, color2?: string];

export interface CatalogEntry {
  id: string;
  name: string;
  color: string;
  system: string;
  defaultPrice: number;
  degreesPerLevel?: number;
  lastLevelMaxDegrees?: number;
  degreeMinMonths?: number;
  degreeMinClasses?: number;
  levels: L[];
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 'bjj', name: 'Jiu-jitsu', color: '#7C93FF', system: 'Faixas e graus', defaultPrice: 220,
    degreesPerLevel: 4, lastLevelMaxDegrees: 6, degreeMinMonths: 4, degreeMinClasses: 40,
    levels: [['Branca', '#EDEDEA', 18, 150], ['Azul', '#2F5FD0', 24, 220], ['Roxa', '#7440C0', 18, 200], ['Marrom', '#6E4426', 12, 150], ['Preta', '#121212', 36, 300]],
  },
  {
    id: 'mt', name: 'Muay Thai', color: '#F2994A', system: 'Prajied', defaultPrice: 190,
    levels: [['Branco', '#EDEDEA', 4, 30], ['Amarelo', '#EAC02E', 6, 45], ['Laranja', '#EE8424', 6, 50], ['Verde', '#2E9A58', 8, 60], ['Azul', '#2F5FD0', 10, 80], ['Roxo', '#7440C0', 12, 90], ['Marrom', '#6E4426', 12, 100], ['Preto', '#121212', null, null]],
  },
  {
    id: 'box', name: 'Boxe', color: '#2EC4B6', system: 'Níveis', defaultPrice: 170,
    levels: [['Iniciante', '#C9CED6', 4, 32], ['Intermediário', '#2EC4B6', 8, 64], ['Avançado', '#17877D', null, null]],
  },
  {
    id: 'judo', name: 'Judô', color: '#4FA3E0', system: 'Faixas (kyu)', defaultPrice: 180,
    levels: [['Branca', '#EDEDEA', 6, 48], ['Cinza', '#9AA0A6', 6, 48], ['Azul', '#2F5FD0', 8, 64], ['Amarela', '#EAC02E', 8, 64], ['Laranja', '#EE8424', 10, 80], ['Verde', '#2E9A58', 12, 96], ['Roxa', '#7440C0', 12, 100], ['Marrom', '#6E4426', 18, 150], ['Preta', '#121212', null, null]],
  },
  {
    id: 'karate', name: 'Karatê', color: '#D97FD0', system: 'Faixas (kyu)', defaultPrice: 170,
    levels: [['Branca', '#EDEDEA', 4, 32], ['Amarela', '#EAC02E', 6, 48], ['Vermelha', '#C8252C', 6, 48], ['Laranja', '#EE8424', 8, 64], ['Verde', '#2E9A58', 8, 64], ['Roxa', '#7440C0', 10, 80], ['Marrom', '#6E4426', 12, 100], ['Preta', '#121212', null, null]],
  },
  {
    id: 'tkd', name: 'Taekwondo', color: '#A3D16B', system: 'Faixas (gub)', defaultPrice: 170,
    levels: [['Branca', '#EDEDEA', 4, 32], ['Amarela', '#EAC02E', 6, 48], ['Verde', '#2E9A58', 6, 48], ['Azul', '#2F5FD0', 8, 64], ['Vermelha', '#C8252C', 12, 96], ['Preta', '#121212', null, null]],
  },
  {
    id: 'mma', name: 'MMA', color: '#F27BA8', system: 'Níveis', defaultPrice: 200,
    levels: [['Iniciante', '#C9CED6', 4, 32], ['Intermediário', '#F27BA8', 8, 64], ['Avançado', '#B8487A', 12, 96], ['Competidor', '#D9A441', null, null]],
  },
  {
    id: 'capoeira', name: 'Capoeira', color: '#C7A06B', system: 'Cordas', defaultPrice: 150,
    levels: [['Crua', '#E8DCC4', 6, 40], ['Amarela', '#EAC02E', 8, 60], ['Laranja', '#EE8424', 10, 70], ['Azul', '#2F5FD0', 12, 80], ['Verde', '#2E9A58', 12, 90], ['Roxa', '#7440C0', 12, 100], ['Marrom', '#6E4426', 18, 140], ['Vermelha', '#C8252C', null, null]],
  },
];

export const FINANCE_CATEGORIES = {
  INCOME: ['Mensalidades', 'Matrículas', 'Aulas particulares', 'Eventos', 'Loja'],
  EXPENSE: ['Aluguel', 'Custo de produtos', 'Folha de pagamento', 'Contas de consumo', 'Manutenção', 'Equipamentos', 'Serviços', 'Marketing'],
};

export const PRODUCT_CATEGORIES = ['Kimonos', 'Faixas', 'Luvas', 'Acessórios', 'Vestuário', 'Bebidas'];

export const DISCIPLINE_COLORS = ['#7C93FF', '#F2994A', '#2EC4B6', '#4FA3E0', '#D97FD0', '#A3D16B', '#F27BA8', '#C7A06B', '#6FD3A6', '#E5484D'];
