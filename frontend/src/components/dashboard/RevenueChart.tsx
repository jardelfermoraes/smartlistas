import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface RevenueChartProps {
  fetcher: (days: number) => Promise<{ data: any }>;
  periodOptions?: number[];
  defaultPeriod?: number;
}

export function RevenueChart({ fetcher, periodOptions = [7, 30, 90], defaultPeriod = 30 }: RevenueChartProps) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  const { data: chartData, isLoading, isError } = useQuery({
    queryKey: ['revenue-chart', period],
    queryFn: () => fetcher(period).then((r) => r.data),
  });

  const displayData = useMemo(() => (Array.isArray(chartData?.data) ? chartData.data : []), [chartData?.data]);
  const maxValue = Math.max(
    ...(displayData.map((i: any) => Math.max(Number(i.predicted_cents) || 0, Number(i.realized_cents) || 0)) || [1]),
    1
  );

  const chartWidth = 640;
  const chartHeight = 220;
  const padding = { left: 60, right: 40, top: 16, bottom: 38 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (displayData.length <= 1) return padding.left;
    return padding.left + (index / (displayData.length - 1)) * graphWidth;
  };

  const getY = (value: number) => {
    return padding.top + graphHeight - (value / maxValue) * graphHeight;
  };

  const predictedPath = useMemo(() => {
    if (displayData.length === 0) return '';
    return displayData
      .map((d: any, i: number) => {
        const x = getX(i);
        const y = getY(Number(d.predicted_cents) || 0);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [displayData, maxValue]);

  const realizedPath = useMemo(() => {
    if (displayData.length === 0) return '';
    return displayData
      .map((d: any, i: number) => {
        const x = getX(i);
        const y = getY(Number(d.realized_cents) || 0);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [displayData, maxValue]);

  const formatMoney = (cents: number | null | undefined) => {
    const v = (Number(cents) || 0) / 100;
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const shouldGroup = period > 30;

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
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
    const y = Math.min(getY(Number(d.predicted_cents) || 0), getY(Number(d.realized_cents) || 0));
    const left = (x / chartWidth) * rect.width;
    const top = (y / chartHeight) * rect.height;

    setHoverIndex(bestIdx);

    const tooltipWidth = 240;
    const tooltipHeight = 72;

    const clampedLeft = Math.min(Math.max(8, left + 12), rect.width - tooltipWidth - 8);
    const clampedTop = Math.min(Math.max(8, top - tooltipHeight - 10), rect.height - tooltipHeight - 8);

    setTooltipPos({ left: clampedLeft, top: clampedTop });
  };

  const handleLeave = () => {
    setHoverIndex(null);
    setTooltipPos(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: '14px' }}>
        <p className="text-gray-500" style={{ fontSize: '13px' }}>
          Previsto (mensal) vs realizado (acumulado)
        </p>
        <div className="flex bg-gray-100 rounded-lg" style={{ padding: '4px' }}>
          {periodOptions.map((days) => (
            <button
              key={days}
              onClick={() => setPeriod(days)}
              className={`rounded-md font-medium transition-all ${
                period === days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              style={{ padding: '7px 12px', fontSize: '12px' }}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3" style={{ marginBottom: '16px' }}>
        <div className="bg-emerald-50 rounded-xl" style={{ padding: '12px' }}>
          <p className="text-emerald-700 font-bold" style={{ fontSize: '18px' }}>
            {formatMoney(chartData?.predicted_monthly_cents)}
          </p>
          <p className="text-emerald-700/70" style={{ fontSize: '11px' }}>
            Previsto/mês ({chartData?.active_subscriptions || 0} assinaturas)
          </p>
        </div>
        <div className="bg-blue-50 rounded-xl" style={{ padding: '12px' }}>
          <p className="text-blue-700 font-bold" style={{ fontSize: '18px' }}>
            {formatMoney(chartData?.realized_cents)}
          </p>
          <p className="text-blue-700/70" style={{ fontSize: '11px' }}>
            Realizado (acumulado)
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6" style={{ marginBottom: '10px' }}>
        <div className="flex items-center gap-2">
          <div className="rounded-full" style={{ width: '12px', height: '12px', backgroundColor: '#10B981' }}></div>
          <span className="text-gray-600" style={{ fontSize: '13px' }}>
            Previsto/mês
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full" style={{ width: '12px', height: '12px', backgroundColor: '#3B82F6' }}></div>
          <span className="text-gray-600" style={{ fontSize: '13px' }}>
            Realizado
          </span>
        </div>
      </div>

      {isError ? (
        <div className="text-sm text-gray-500" style={{ padding: '28px 0', textAlign: 'center' }}>
          Erro ao carregar dados
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center" style={{ height: '190px' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '220px' }}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
          >
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

            <path
              d={predictedPath}
              fill="none"
              stroke="#10B981"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={realizedPath}
              fill="none"
              stroke="#3B82F6"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {displayData.map((d: any, i: number) => (
              <circle
                key={`p-${i}`}
                cx={getX(i)}
                cy={getY(Number(d.predicted_cents) || 0)}
                r={hoverIndex === i ? 3.6 : 2.4}
                fill="#10B981"
                stroke="white"
                strokeWidth={hoverIndex === i ? 2 : 1}
              />
            ))}

            {displayData.map((d: any, i: number) => (
              <circle
                key={`r-${i}`}
                cx={getX(i)}
                cy={getY(Number(d.realized_cents) || 0)}
                r={hoverIndex === i ? 3.6 : 2.4}
                fill="#3B82F6"
                stroke="white"
                strokeWidth={hoverIndex === i ? 2 : 1}
              />
            ))}

            {displayData.map((item: any, idx: number) => {
              const showLabel =
                !shouldGroup || idx % Math.ceil(displayData.length / 7) === 0 || idx === displayData.length - 1;
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
              style={{ left: tooltipPos.left, top: tooltipPos.top, width: '240px', padding: '10px 12px' }}
            >
              <div className="text-xs font-semibold text-gray-900">{displayData[hoverIndex].label}</div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">Previsto/mês</span>
                <span className="font-semibold" style={{ color: '#10B981' }}>
                  {formatMoney(displayData[hoverIndex].predicted_cents)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">Realizado</span>
                <span className="font-semibold" style={{ color: '#3B82F6' }}>
                  {formatMoney(displayData[hoverIndex].realized_cents)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
