'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  complete: boolean;
}

interface AuthChartProps {
  tickInterval?: number;
  candleInterval?: number;
}

function rnd(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function generateHistory(count: number, startPrice = 42000): CandleData[] {
  const out: CandleData[] = [];
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const move = rnd(-600, 600);
    const open = price;
    const close = price + move;
    const wick = rnd(50, 250);
    out.push({
      open,
      close,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      volume: rnd(0.3, 1),
      complete: true,
    });
    price = close;
  }
  return out;
}

export default function AuthChart({
  tickInterval = 120,
  candleInterval = 3200,
}: AuthChartProps) {
  const MAX_VISIBLE = 38;
  const HISTORY = 36;

  const [candles, setCandles] = useState<CandleData[]>(() => {
    const hist = generateHistory(HISTORY);
    const lastClose = hist[hist.length - 1].close;
    hist.push({
      open: lastClose,
      close: lastClose,
      high: lastClose + rnd(20, 80),
      low: lastClose - rnd(20, 80),
      volume: 0.1,
      complete: false,
    });
    return hist;
  });

  const tick = useCallback(() => {
    setCandles((prev) => {
      const next = [...prev];
      const last = { ...next[next.length - 1] };
      const move = rnd(-180, 180);
      last.close = last.close + move;
      last.high = Math.max(last.high, last.close) + rnd(0, 30);
      last.low = Math.min(last.low, last.close) - rnd(0, 30);
      last.volume = Math.min(1, last.volume + rnd(0.01, 0.06));
      next[next.length - 1] = last;
      return next;
    });
  }, []);

  const completeCandle = useCallback(() => {
    setCandles((prev) => {
      const next = [...prev];
      const closing = { ...next[next.length - 1], complete: true };
      next[next.length - 1] = closing;
      const newOpen = closing.close;
      next.push({
        open: newOpen,
        close: newOpen,
        high: newOpen + rnd(20, 80),
        low: newOpen - rnd(20, 80),
        volume: rnd(0.05, 0.2),
        complete: false,
      });
      if (next.length > MAX_VISIBLE + 5) next.shift();
      return next;
    });
  }, [MAX_VISIBLE]);

  useEffect(() => {
    const t = setInterval(tick, tickInterval);
    return () => clearInterval(t);
  }, [tick, tickInterval]);

  useEffect(() => {
    const t = setInterval(completeCandle, candleInterval);
    return () => clearInterval(t);
  }, [completeCandle, candleInterval]);

  const W = 480;
  const H = 260;
  const PAD_L = 10;
  const PAD_R = 10;
  const PAD_T = 18;
  const PAD_B = 10;
  const CHART_W = W - PAD_L - PAD_R;
  const CHART_H = H - PAD_T - PAD_B;
  const VOL_H = 28;

  const visible = candles.slice(-MAX_VISIBLE);
  const n = visible.length;
  const allPrices = visible.flatMap((c) => [c.high, c.low]);
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const range = Math.max(maxP - minP, 100);
  const padP = range * 0.08;
  const lo = minP - padP;
  const hi = maxP + padP;
  const priceRange = hi - lo;

  function py(price: number) {
    return PAD_T + CHART_H * (1 - (price - lo) / priceRange);
  }

  const slotW = CHART_W / MAX_VISIBLE;
  const bodyW = Math.max(3, slotW * 0.55);

  function cx(idx: number) {
    return PAD_L + slotW * idx + slotW / 2;
  }

  const maxVol = Math.max(...visible.map((c) => c.volume), 0.01);
  const lastCandle = visible[n - 1];
  const firstCandle = visible[0];
  const priceChange = lastCandle.close - firstCandle.open;
  const positive = priceChange >= 0;

  const closePts = visible.map((c, i) => `${cx(i)},${py(c.close)}`).join(' ');
  const areaPath =
    `M${cx(0)},${py(visible[0].close)} ` +
    visible
      .slice(1)
      .map((c, i) => `L${cx(i + 1)},${py(c.close)}`)
      .join(' ') +
    ` L${cx(n - 1)},${PAD_T + CHART_H} L${cx(0)},${PAD_T + CHART_H} Z`;

  const gridLevels = 4;
  const gridLines: { y: number; price: number }[] = [];
  for (let i = 0; i <= gridLevels; i++) {
    const price = lo + (priceRange / gridLevels) * i;
    gridLines.push({ y: py(price), price });
  }

  const liveY = py(lastCandle.close);
  const GREEN = '#00D97E';
  const RED = '#F5475B';
  const accent = positive ? GREEN : RED;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          <linearGradient id="areaGradGreen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00D97E" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#00D97E" stopOpacity="0.00" />
          </linearGradient>
          <linearGradient id="areaGradRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F5475B" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#F5475B" stopOpacity="0.00" />
          </linearGradient>
          <filter id="priceGlow" x="-20%" y="-200%" width="140%" height="500%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="chartArea">
            <rect x={PAD_L} y={PAD_T} width={CHART_W} height={CHART_H} />
          </clipPath>
        </defs>

        <path
          d={areaPath}
          fill={positive ? 'url(#areaGradGreen)' : 'url(#areaGradRed)'}
          clipPath="url(#chartArea)"
          style={{ transition: 'fill 0.6s' }}
        />

        <g clipPath="url(#chartArea)">
          {visible.map((c, i) => {
            const bull = c.close >= c.open;
            const color = bull ? GREEN : RED;
            const x = cx(i);
            const yHi = py(c.high);
            const yLo = py(c.low);
            const yO = py(c.open);
            const yC = py(c.close);
            const bTop = Math.min(yO, yC);
            const bH = Math.max(Math.abs(yC - yO), 1.5);
            const isLast = i === n - 1;

            const volH = VOL_H * c.volume / maxVol;
            const volY = PAD_T + CHART_H + (VOL_H - volH) + 4;

            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={yHi}
                  x2={x}
                  y2={yLo}
                  stroke={color}
                  strokeWidth={isLast ? 0.9 : 0.7}
                  opacity={isLast ? 0.9 : 0.55 + 0.45 * (i / n)}
                />
                <rect
                  x={x - bodyW / 2}
                  y={bTop}
                  width={bodyW}
                  height={bH}
                  rx={0.8}
                  fill={bull ? color : 'transparent'}
                  stroke={color}
                  strokeWidth={bull ? 0 : 0.8}
                  opacity={isLast ? 0.95 : 0.6 + 0.4 * (i / n)}
                  style={{ transition: 'all 0.12s linear' }}
                />
                {isLast && (
                  <rect
                    x={x - bodyW / 2 - 1}
                    y={bTop - 1}
                    width={bodyW + 2}
                    height={bH + 2}
                    rx={1.2}
                    fill="none"
                    stroke={color}
                    strokeWidth={0.6}
                    opacity={0.3}
                  />
                )}
                <rect
                  x={x - bodyW / 2}
                  y={volY}
                  width={bodyW}
                  height={volH}
                  rx={0.6}
                  fill={color}
                  opacity={0.25 + 0.2 * (i / n)}
                  style={{ transition: 'height 0.12s linear, y 0.12s linear' }}
                />
              </g>
            );
          })}
        </g>

        <polyline
          points={closePts}
          fill="none"
          stroke={accent}
          strokeWidth={0.8}
          strokeLinejoin="round"
          opacity={0.25}
          clipPath="url(#chartArea)"
          style={{ transition: 'stroke 0.4s' }}
        />

        <g filter="url(#priceGlow)" clipPath="url(#chartArea)">
          <line
            x1={PAD_L}
            y1={liveY}
            x2={PAD_L + CHART_W}
            y2={liveY}
            stroke={accent}
            strokeWidth={0.9}
            strokeDasharray="3 3"
            opacity={0.7}
            style={{ transition: 'y1 0.12s linear, y2 0.12s linear, stroke 0.4s' }}
          />
        </g>

        <circle
          cx={cx(n - 1)}
          cy={liveY}
          r={2.5}
          fill={accent}
          opacity={0.9}
          style={{ transition: 'cy 0.12s linear, fill 0.4s' }}
        >
          <animate attributeName="r" values="2.5;4;2.5" dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>

      <style>{`
        @keyframes blink {
          0%,100% { opacity: 0.9; }
          50%      { opacity: 0.25; }
        }
      `}</style>
    </div>
  );
}