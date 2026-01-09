import { useId, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface SingleSeriesChartProps {
  subtitle: string;
  color: string;
  bgClass: string;
  fetcher: (days: number) => Promise<{ data: any }>;
  periodOptions?: number[];
  defaultPeriod?: number;
}

export function SingleSeriesChart({
  subtitle,
  color,
  bgClass,
  fetcher,
  periodOptions = [7, 30, 90],
  defaultPeriod = 30,
}: SingleSeriesChartProps) {
  const gradientId = useId();
  const [period, setPeriod] = useState(defaultPeriod);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);

  const { data: chartData, isLoading, isError } = useQuery({
    queryKey: ['single-series-chart', subtitle, period],
    queryFn: () => fetcher(period).then((r) => r.data),
  });

  const displayData = useMemo(() => (Array.isArray(chartData?.data) ? chartData.data : []), [chartData?.data]);
  const maxValue = Math.max(...(displayData.map((i: any) => Number(i.value) || 0) || [1]), 1);

  const chartWidth = 640;
  const chartHeight = 210;
  const padding = { left: 50, right: 30, top: 14, bottom: 38 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (displayData.length <= 1) return padding.left;
    return padding.left + (index / (displayData.length - 1)) * graphWidth;
  };

  const getY = (value: number) => {
    return padding.top + graphHeight - (value / maxValue) * graphHeight;
  };

  const linePath = useMemo(() => {
    if (displayData.length === 0) return '';
    return displayData
      .map((d: any, i: number) => {
        const x = getX(i);
        const y = getY(Number(d.value) || 0);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [displayData, maxValue]);

  const areaPath = useMemo(() => {
    if (!linePath || displayData.length === 0) return '';
    const lastX = getX(displayData.length - 1);
    const firstX = getX(0);
    const bottomY = padding.top + graphHeight;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [linePath, displayData.length, maxValue]);

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
    const y = getY(Number(d.value) || 0);
    const left = (x / chartWidth) * rect.width;
    const top = (y / chartHeight) * rect.height;

    setHoverIndex(bestIdx);

    const tooltipWidth = 190;
    const tooltipHeight = 58;

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
          {subtitle}
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

      <div className="grid grid-cols-3 gap-3" style={{ marginBottom: '14px' }}>
        <div className={`${bgClass} rounded-xl`} style={{ padding: '12px' }}>
          <p className="font-bold" style={{ fontSize: '18px', color }}>
            {chartData?.totals?.value ?? 0}
          </p>
          <p style={{ fontSize: '11px', color: `${color}B3` }}>Total</p>
        </div>
        <div className={`${bgClass} rounded-xl`} style={{ padding: '12px' }}>
          <p className="font-bold" style={{ fontSize: '18px', color }}>
            {chartData?.medias?.value ?? 0}
          </p>
          <p style={{ fontSize: '11px', color: `${color}B3` }}>Média/dia</p>
        </div>
        <div className={`${bgClass} rounded-xl`} style={{ padding: '12px' }}>
          <p className="font-bold" style={{ fontSize: '18px', color }}>
            {chartData?.max?.value ?? 0}
          </p>
          <p style={{ fontSize: '11px', color: `${color}B3` }}>Pico</p>
        </div>
      </div>

      {isError ? (
        <div className="text-sm text-gray-500" style={{ padding: '28px 0', textAlign: 'center' }}>
          Erro ao carregar dados
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center" style={{ height: '180px' }}>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: color }}></div>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '210px' }}
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

            {[100, 75, 50, 25, 0].map((percent) => {
              const y = padding.top + graphHeight - (percent / 100) * graphHeight;
              const v = Math.round((maxValue * percent) / 100);
              return (
                <text
                  key={`y-${percent}`}
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#6B7280"
                >
                  {v}
                </text>
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

            <path d={areaPath} fill={`url(#${gradientId})`} opacity="0.22" />
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {displayData.map((d: any, i: number) => (
              <circle
                key={i}
                cx={getX(i)}
                cy={getY(Number(d.value) || 0)}
                r={hoverIndex === i ? 4 : 2.6}
                fill={color}
                stroke="white"
                strokeWidth={hoverIndex === i ? 2 : 1}
              />
            ))}

            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>

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
              style={{ left: tooltipPos.left, top: tooltipPos.top, width: '190px', padding: '10px 12px' }}
            >
              <div className="text-xs font-semibold text-gray-900">{displayData[hoverIndex].label}</div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">Valor</span>
                <span className="font-semibold" style={{ color }}>
                  {displayData[hoverIndex].value}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
