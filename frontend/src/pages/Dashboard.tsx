import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ReactNode } from 'react';
import { 
  Store, 
  Receipt, 
  TrendingUp,
  Package,
  LucideIcon,
  ChevronRight,
  Smartphone,
  Users,
  UserPlus,
  ShoppingCart,
  CreditCard
} from 'lucide-react';
import { statsApi, healthApi } from '../api/client';
import { SingleSeriesChart } from '../components/dashboard/SingleSeriesChart';
import { RevenueChart } from '../components/dashboard/RevenueChart';

// ============================================
// COMPONENTE: Card Base (container branco)
// ============================================
interface CardProps {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  noPadding?: boolean;
}

function Card({ children, title, action, noPadding }: CardProps) {
  return (
    <div 
      className="bg-white rounded-2xl border border-gray-200/60 shadow-sm"
      style={{ padding: noPadding ? '0' : '24px' }}
    >
      {title && (
        <div 
          className="flex items-center justify-between"
          style={{ marginBottom: '16px', padding: noPadding ? '24px 24px 0 24px' : '0' }}
        >
          <h2 className="font-semibold text-gray-900">{title}</h2>
          {action}
        </div>
      )}
      <div style={{ padding: noPadding ? '0 24px 24px 24px' : '0' }}>
        {children}
      </div>
    </div>
  );
}

// ============================================
// COMPONENTE: StatCard (cards coloridos de estatísticas)
// ============================================
interface StatCardProps {
  title: string;
  value: number;
  subtitle: string;
  detail: string;
  icon: LucideIcon;
  color: 'blue' | 'green' | 'orange' | 'emerald';
}

const statColorStyles = {
  blue: {
    bg: 'bg-gradient-to-br from-blue-500 to-blue-600',
    iconBg: 'bg-blue-400/30',
    subtitle: 'text-blue-100',
    detail: 'text-blue-200/80',
  },
  green: {
    bg: 'bg-gradient-to-br from-green-500 to-green-600',
    iconBg: 'bg-green-400/30',
    subtitle: 'text-green-100',
    detail: 'text-green-200/80',
  },
  orange: {
    bg: 'bg-gradient-to-br from-orange-400 to-orange-500',
    iconBg: 'bg-orange-300/30',
    subtitle: 'text-orange-100',
    detail: 'text-orange-200/80',
  },
  emerald: {
    bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-400/30',
    subtitle: 'text-emerald-100',
    detail: 'text-emerald-200/80',
  },
};

function StatCard({ title, value, subtitle, detail, icon: Icon, color }: StatCardProps) {
  const styles = statColorStyles[color];
  
  return (
    <div 
      className={`${styles.bg} rounded-2xl text-white relative overflow-hidden shadow-md`}
      style={{ padding: '32px' }}
    >
      {/* Ícone de fundo */}
      <div className="absolute opacity-20" style={{ right: '24px', top: '24px' }}>
        <Icon size={72} strokeWidth={1} />
      </div>
      
      {/* Conteúdo */}
      <div className="relative z-10">
        <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
          <div className={`${styles.iconBg} rounded-xl`} style={{ padding: '12px' }}>
            <Icon size={22} />
          </div>
          <span className={`text-xs font-semibold ${styles.subtitle} uppercase tracking-wider`}>
            {title}
          </span>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <p className="text-5xl font-bold tracking-tight">{value}</p>
        </div>
        
        <div>
          <p className={`text-sm font-medium ${styles.subtitle}`}>{subtitle}</p>
          <p className={`text-xs ${styles.detail}`} style={{ marginTop: '8px' }}>{detail}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENTE: CuponsChart (gráfico de linhas com duas séries)
// ============================================
interface CuponsChartProps {
  onPeriodChange?: (days: number) => void;
}

function CuponsChart({ onPeriodChange }: CuponsChartProps) {
  const [period, setPeriod] = useState(7);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  
  const { data: chartData, isLoading } = useQuery({
    queryKey: ['cupons-chart', period],
    queryFn: () => statsApi.getCuponsChart(period).then(r => r.data),
  });

  const handlePeriodChange = (days: number) => {
    setPeriod(days);
    onPeriodChange?.(days);
  };

  const displayData = chartData?.data || [];
  
  // Escalas separadas para cada série
  const maxCupons = Math.max(...(displayData.map(i => i.cupons) || [1]), 1);
  const maxProdutos = Math.max(...(displayData.map(i => i.produtos) || [1]), 1);
  
  const shouldGroup = period > 15;
  
  // Calcula pontos para o SVG
  const chartWidth = 640;
  const chartHeight = 240;
  const padding = { left: 56, right: 56, top: 18, bottom: 42 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;
  
  const getX = (index: number) => {
    if (displayData.length <= 1) return padding.left;
    return padding.left + (index / (displayData.length - 1)) * graphWidth;
  };
  
  // Y para cupons (escala esquerda)
  const getYCupons = (value: number) => {
    return padding.top + graphHeight - (value / maxCupons) * graphHeight;
  };
  
  // Y para produtos (escala direita)
  const getYProdutos = (value: number) => {
    return padding.top + graphHeight - (value / maxProdutos) * graphHeight;
  };
  
  // Gera path para linha de cupons
  const generateCuponsPath = () => {
    if (displayData.length === 0) return '';
    
    const points = displayData.map((d, i) => {
      const x = getX(i);
      const y = getYCupons(d.cupons);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    });
    
    return points.join(' ');
  };
  
  // Gera path para linha de produtos
  const generateProdutosPath = () => {
    if (displayData.length === 0) return '';
    
    const points = displayData.map((d, i) => {
      const x = getX(i);
      const y = getYProdutos(d.produtos);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    });
    
    return points.join(' ');
  };
  
  // Gera path para área preenchida de cupons
  const generateCuponsAreaPath = () => {
    if (displayData.length === 0) return '';
    
    const linePath = generateCuponsPath();
    const lastX = getX(displayData.length - 1);
    const firstX = getX(0);
    const bottomY = padding.top + graphHeight;
    
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };
  
  // Gera path para área preenchida de produtos
  const generateProdutosAreaPath = () => {
    if (displayData.length === 0) return '';
    
    const linePath = generateProdutosPath();
    const lastX = getX(displayData.length - 1);
    const firstX = getX(0);
    const bottomY = padding.top + graphHeight;
    
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const handleChartMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!displayData.length) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const xSvg = (xPx / rect.width) * chartWidth;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < displayData.length; i++) {
      const d = Math.abs(getX(i) - xSvg);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const d = displayData[bestIdx];
    const x = getX(bestIdx);
    const y = Math.min(getYCupons(d.cupons), getYProdutos(d.produtos));
    const left = (x / chartWidth) * rect.width;
    const top = (y / chartHeight) * rect.height;

    setHoverIndex(bestIdx);

    const tooltipWidth = 190;
    const tooltipHeight = 62;

    const clampedLeft = Math.min(Math.max(8, left + 12), rect.width - tooltipWidth - 8);
    const clampedTop = Math.min(Math.max(8, top - tooltipHeight - 10), rect.height - tooltipHeight - 8);

    setTooltipPos({ left: clampedLeft, top: clampedTop });
  };

  const handleChartLeave = () => {
    setHoverIndex(null);
    setTooltipPos(null);
  };
  
  return (
    <div>
      {/* Header com seletor */}
      <div className="flex items-center justify-between" style={{ marginBottom: '24px' }}>
        <div>
          <h2 className="font-semibold text-gray-900" style={{ fontSize: '16px' }}>
            Evolução Diária
          </h2>
          <p className="text-gray-500" style={{ fontSize: '13px', marginTop: '4px' }}>
            Cupons e novos produtos nos últimos {period} dias
          </p>
        </div>
        
        {/* Seletor de período */}
        <div className="flex bg-gray-100 rounded-lg" style={{ padding: '4px' }}>
          {[7, 15, 30].map((days) => (
            <button
              key={days}
              onClick={() => handlePeriodChange(days)}
              className={`rounded-md font-medium transition-all ${
                period === days 
                  ? 'bg-white text-gray-900 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              {days} dias
            </button>
          ))}
        </div>
      </div>

      {/* Estatísticas resumidas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ marginBottom: '20px' }}>
        <div className="bg-blue-50 rounded-xl" style={{ padding: '12px' }}>
          <p className="text-blue-600 font-bold" style={{ fontSize: '22px' }}>{chartData?.totals?.cupons || 0}</p>
          <p className="text-blue-600/70" style={{ fontSize: '11px' }}>Cupons</p>
        </div>
        <div className="bg-green-50 rounded-xl" style={{ padding: '12px' }}>
          <p className="text-green-600 font-bold" style={{ fontSize: '22px' }}>{chartData?.totals?.produtos || 0}</p>
          <p className="text-green-600/70" style={{ fontSize: '11px' }}>Novos Produtos</p>
        </div>
        <div className="bg-blue-50/50 rounded-xl" style={{ padding: '12px' }}>
          <p className="text-blue-500 font-bold" style={{ fontSize: '22px' }}>{chartData?.medias?.cupons || 0}</p>
          <p className="text-blue-500/70" style={{ fontSize: '11px' }}>Média Cupons/dia</p>
        </div>
        <div className="bg-green-50/50 rounded-xl" style={{ padding: '12px' }}>
          <p className="text-green-500 font-bold" style={{ fontSize: '22px' }}>{chartData?.medias?.produtos || 0}</p>
          <p className="text-green-500/70" style={{ fontSize: '11px' }}>Média Produtos/dia</p>
        </div>
      </div>

      {/* Legenda */}
      <div className="flex items-center justify-center gap-6" style={{ marginBottom: '16px' }}>
        <div className="flex items-center gap-2">
          <div className="rounded-full" style={{ width: '12px', height: '12px', backgroundColor: '#3B82F6' }}></div>
          <span className="text-gray-600" style={{ fontSize: '13px' }}>Cupons Importados</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full" style={{ width: '12px', height: '12px', backgroundColor: '#10B981' }}></div>
          <span className="text-gray-600" style={{ fontSize: '13px' }}>Novos Produtos</span>
        </div>
      </div>

      {/* Gráfico */}
      {isLoading ? (
        <div className="flex items-center justify-center" style={{ height: '200px' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* SVG do gráfico */}
          <svg 
            viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '240px' }}
            onMouseMove={handleChartMove}
            onMouseLeave={handleChartLeave}
          >
            {/* Linhas de grade */}
            {[0, 25, 50, 75, 100].map((percent) => {
              const y = padding.top + graphHeight - (percent / 100) * graphHeight;
              return (
                <line
                  key={percent}
                  x1={padding.left}
                  y1={y}
                  x2={chartWidth - padding.right}
                  y2={y}
                  stroke="#f3f4f6"
                  strokeWidth="0.3"
                />
              );
            })}

            {/* Labels eixo Y (Cupons - esquerda) */}
            {[100, 75, 50, 25, 0].map((percent) => {
              const y = padding.top + graphHeight - (percent / 100) * graphHeight;
              const v = Math.round((maxCupons * percent) / 100);
              return (
                <text
                  key={`yL-${percent}`}
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#3B82F6"
                >
                  {v}
                </text>
              );
            })}

            {/* Labels eixo Y (Produtos - direita) */}
            {[100, 75, 50, 25, 0].map((percent) => {
              const y = padding.top + graphHeight - (percent / 100) * graphHeight;
              const v = Math.round((maxProdutos * percent) / 100);
              return (
                <text
                  key={`yR-${percent}`}
                  x={chartWidth - padding.right + 10}
                  y={y + 4}
                  textAnchor="start"
                  fontSize="10"
                  fill="#10B981"
                >
                  {v}
                </text>
              );
            })}

            {/* Cursor/seleção */}
            {hoverIndex !== null && displayData[hoverIndex] && (
              <line
                x1={getX(hoverIndex)}
                y1={padding.top}
                x2={getX(hoverIndex)}
                y2={padding.top + graphHeight}
                stroke="#E5E7EB"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            )}
            
            {/* Área preenchida - Cupons */}
            <path
              d={generateCuponsAreaPath()}
              fill="url(#blueGradient)"
              opacity="0.2"
            />
            
            {/* Área preenchida - Produtos */}
            <path
              d={generateProdutosAreaPath()}
              fill="url(#greenGradient)"
              opacity="0.2"
            />
            
            {/* Linha - Cupons */}
            <path
              d={generateCuponsPath()}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Linha - Produtos */}
            <path
              d={generateProdutosPath()}
              fill="none"
              stroke="#10B981"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Pontos - Cupons */}
            {displayData.map((d, i) => (
              <circle
                key={`cupons-${i}`}
                cx={getX(i)}
                cy={getYCupons(d.cupons)}
                r={hoverIndex === i ? 4 : 2.5}
                fill="#3B82F6"
                stroke="white"
                strokeWidth={hoverIndex === i ? 2 : 1}
              />
            ))}
            
            {/* Pontos - Produtos */}
            {displayData.map((d, i) => (
              <circle
                key={`produtos-${i}`}
                cx={getX(i)}
                cy={getYProdutos(d.produtos)}
                r={hoverIndex === i ? 4 : 2.5}
                fill="#10B981"
                stroke="white"
                strokeWidth={hoverIndex === i ? 2 : 1}
              />
            ))}
            
            {/* Gradientes */}
            <defs>
              <linearGradient id="blueGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Eixo X - Labels das datas */}
            {displayData.map((item, idx) => {
              const showLabel = !shouldGroup || idx % Math.ceil(displayData.length / 7) === 0 || idx === displayData.length - 1;
              if (!showLabel) return null;
              return (
                <text
                  key={`x-${idx}`}
                  x={getX(idx)}
                  y={chartHeight - 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill="#6B7280"
                >
                  {item.label}
                </text>
              );
            })}
          </svg>

          {hoverIndex !== null && tooltipPos && displayData[hoverIndex] && (
            <div
              className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg"
              style={{ left: tooltipPos.left, top: tooltipPos.top, width: '190px', padding: '10px 12px' }}
            >
              <div className="text-xs font-semibold text-gray-900">
                {displayData[hoverIndex].label}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">Cupons</span>
                <span className="font-semibold" style={{ color: '#3B82F6' }}>
                  {displayData[hoverIndex].cupons}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">Produtos</span>
                <span className="font-semibold" style={{ color: '#10B981' }}>
                  {displayData[hoverIndex].produtos}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// COMPONENTE: CategoryBar (barras de categoria)
// ============================================
interface CategoryBarProps {
  data: { label: string; value: number }[];
  colors: string[];
}

function CategoryBar({ data, colors }: CategoryBarProps) {
  const maxValue = Math.max(...data.map(c => c.value), 1);
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {data.map((cat, idx) => {
        const width = Math.max((cat.value / maxValue) * 100, 5);
        return (
          <div key={idx} className="flex items-center" style={{ gap: '16px' }}>
            <span className="text-sm text-gray-600 truncate" style={{ width: '100px' }}>{cat.label}</span>
            <div className="flex-1 bg-gray-100 rounded-full" style={{ height: '10px' }}>
              <div 
                className={`h-full ${colors[idx % colors.length]} rounded-full transition-all duration-300`}
                style={{ width: `${width}%` }}
              />
            </div>
            <span className="text-xs text-gray-500" style={{ width: '30px', textAlign: 'right' }}>{cat.value}</span>
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// COMPONENTE: StatusIndicator (indicador de status)
// ============================================
interface StatusIndicatorProps {
  label: string;
  sublabel: string;
  online: boolean;
  variant?: 'default' | 'pill';
}

function StatusIndicator({ label, sublabel, online, variant = 'default' }: StatusIndicatorProps) {
  if (variant === 'pill') {
    return (
      <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5">
        <span
          className={`inline-block rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
          style={{ width: '8px', height: '8px' }}
        />
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-500">{sublabel}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center" style={{ gap: '12px' }}>
      <div 
        className={`rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
        style={{ width: '12px', height: '12px' }}
      />
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500">{sublabel}</p>
      </div>
    </div>
  );
}

// ============================================
// COMPONENTE: ActivityItem (item de atividade)
// ============================================
// ============================================
// COMPONENTE: QuickAction (botão de ação rápida)
// ============================================
interface QuickActionProps {
  to: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  sublabel: string;
}

function QuickAction({ to, icon: Icon, iconBg, iconColor, label, sublabel }: QuickActionProps) {
  return (
    <Link 
      to={to} 
      className="flex flex-col items-center rounded-xl hover:bg-gray-50 transition-colors border border-gray-100"
      style={{ padding: '20px 16px' }}
    >
      <div 
        className={`${iconBg} rounded-full flex items-center justify-center`}
        style={{ width: '44px', height: '44px', marginBottom: '12px' }}
      >
        <Icon size={20} className={iconColor} />
      </div>
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <span className="text-xs text-gray-500" style={{ marginTop: '2px' }}>{sublabel}</span>
    </Link>
  );
}

export function Dashboard() {
  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => statsApi.getDashboard().then(r => r.data),
    refetchInterval: 60000,
  });

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.check(),
    refetchInterval: 30000,
  });

  const stats = dashboardData?.stats;
  const dbOk = Boolean(health?.data?.db);
  const redisOk = Boolean(health?.data?.redis);

  const categoryColors = [
    'bg-blue-500',
    'bg-teal-500', 
    'bg-violet-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-emerald-500',
    'bg-indigo-500',
    'bg-orange-500',
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 pt-10 pb-6 lg:px-8 lg:pt-12 lg:pb-8 space-y-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Painel</h1>
          <p className="text-gray-500 mt-1">Visão geral do sistema e atalhos para as rotinas mais usadas.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <StatusIndicator label="DB" sublabel={dbOk ? 'Online' : 'Offline'} online={dbOk} variant="pill" />
          <StatusIndicator label="Redis" sublabel={redisOk ? 'Online' : 'Offline'} online={redisOk} variant="pill" />
          <StatusIndicator label="API" sublabel="Online" online={true} variant="pill" />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" style={{ marginBottom: '12px' }}>
        <StatCard
          title="Lojas"
          value={stats?.total_lojas || 0}
          subtitle="Lojas Cadastradas"
          detail={`⚠ ${stats?.lojas_pendentes || 0} pendentes de verificação`}
          icon={Store}
          color="blue"
        />
        
        <StatCard
          title="Produtos"
          value={stats?.total_produtos || 0}
          subtitle="Produtos no Catálogo"
          detail={`${stats?.produtos_com_preco || 0} com preço registrado`}
          icon={Package}
          color="green"
        />
        
        <StatCard
          title="Cupons"
          value={stats?.total_cupons || 0}
          subtitle="Cupons Processados"
          detail={`${stats?.cupons_processados || 0} importados com sucesso`}
          icon={Receipt}
          color="orange"
        />
        
        <StatCard
          title="Preços"
          value={stats?.total_precos || 0}
          subtitle="Preços Coletados"
          detail={`+${stats?.precos_ultimos_7_dias || 0} nos últimos 7 dias`}
          icon={TrendingUp}
          color="emerald"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-2">
        
        {/* Left Column */}
        <div className="lg:col-span-2 flex flex-col gap-8">
          
          {/* Chart */}
          <Card>
            <CuponsChart />
          </Card>

          <Card title="Cadastros de Usuários" action={<UserPlus size={18} className="text-gray-400" />}>
            <SingleSeriesChart
              subtitle="Novos usuários no app"
              color="#7C3AED"
              bgClass="bg-purple-50"
              fetcher={(days) => statsApi.getAppUsersChart(days)}
            />
          </Card>

          <Card title="Listas Finalizadas" action={<ShoppingCart size={18} className="text-gray-400" />}>
            <SingleSeriesChart
              subtitle="Compras concluídas (snapshot)"
              color="#F59E0B"
              bgClass="bg-amber-50"
              fetcher={(days) => statsApi.getAppPurchasesChart(days)}
            />
          </Card>

          <Card title="Faturamento" action={<CreditCard size={18} className="text-gray-400" />}>
            <RevenueChart fetcher={(days) => statsApi.getRevenueChart(days)} />
          </Card>

          {/* Quick Actions */}
          <Card title="Ações Rápidas">
            <div className="grid grid-cols-2 gap-4">
              <QuickAction
                to="/receipts"
                icon={Receipt}
                iconBg="bg-orange-100"
                iconColor="text-orange-600"
                label="Cupons"
                sublabel="Importar e revisar"
              />
              <QuickAction
                to="/stores"
                icon={Store}
                iconBg="bg-blue-100"
                iconColor="text-blue-600"
                label="Lojas"
                sublabel="Gerenciar"
              />
              <QuickAction
                to="/app-receipt-keys"
                icon={Smartphone}
                iconBg="bg-green-100"
                iconColor="text-green-600"
                label="Chaves"
                sublabel="Triagem do app"
              />
              <QuickAction
                to="/app-users"
                icon={Users}
                iconBg="bg-purple-100"
                iconColor="text-purple-600"
                label="Usuários"
                sublabel="App"
              />
            </div>
          </Card>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-8">

          {/* Categories */}
          <Card 
            title="Produtos por Categoria"
            action={
              <Link to="/canonical" className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                Gerenciar Catálogo <ChevronRight size={14} />
              </Link>
            }
          >
            <CategoryBar 
              data={dashboardData?.produtos_por_categoria?.slice(0, 8) || []}
              colors={categoryColors}
            />
          </Card>

        </div>
      </div>
    </div>
  );
}
