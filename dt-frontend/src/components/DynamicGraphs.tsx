"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { useStreamSensorDataQuery } from "@/services/api";
import { Layout } from "plotly.js-basic-dist";
import Card from "@/components/ui/Card";

interface SensorData {
  air_temperature: number;
  process_temperature: number;
  rotational_speed: number;
  torque: number;
  tool_wear: number;
  cycle_count: number;
  timestamp?: number;
}

const fieldsToGraph = [
  { key: "air_temperature", title: "Air Temperature (K)" },
  { key: "process_temperature", title: "Process Temperature (K)" },
  { key: "rotational_speed", title: "Rotational Speed (RPM)" },
  { key: "torque", title: "Torque (Nm)" },
  { key: "tool_wear", title: "Tool Wear (min)" },
  { key: "cycle_count", title: "Cycle Count" },
];

const timeRanges: Record<string, number | null> = {
  "1h": 3600000,
  "6h": 21600000,
  "24h": 86400000,
  "7d": 604800000,
  "All": null,
};

const DynamicGraphs: React.FC = () => {
  const { data: rawStreamData = [] } = useStreamSensorDataQuery();
  const graphRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const plotlyRef = useRef<typeof import("plotly.js-basic-dist") | null>(null);
  const [streamData, setStreamData] = useState<SensorData[]>([]);
  const manualZoom = useRef<Record<string, boolean>>({});
  const selectedRange = useRef<Record<string, string>>(
    fieldsToGraph.reduce((acc, { key }) => {
      acc[key] = "All";
      return acc;
    }, {} as Record<string, string>)
  );  
  const uirevisionRef = useRef<Record<string, number>>({});

  const setGraphRef = useCallback((key: string, el: HTMLDivElement | null) => {
    graphRefs.current[key] = el;
  }, []);

  const resetView = (key: string) => {
    uirevisionRef.current[key] = (uirevisionRef.current[key] || 0) + 1;
    manualZoom.current[key] = false;
    selectedRange.current[key] = "All";
  };

  const handleRangeSelection = (key: string, range: string) => {
    selectedRange.current[key] = range;
    manualZoom.current[key] = true;

    const graphDiv = graphRefs.current[key];
    if (!graphDiv || !plotlyRef.current) return;
    const Plotly = plotlyRef.current!;
    const timestamps = streamData
      .map((d) => d.timestamp)
      .filter((timestamp): timestamp is number => timestamp !== undefined)
      .sort((a, b) => a - b)
      .map((t) => new Date(t));

    if (!timestamps.length) return;

    const endTime = timestamps[timestamps.length - 1].getTime();
    const startTime = range === "All" ? timestamps[0].getTime() : endTime - (timeRanges[range] || 0);

    Plotly.relayout(graphDiv, {
      "xaxis.range": [startTime, endTime]
    });

    if (range === "All") {
      manualZoom.current[key] = false;
      resetView(key); 
    }
  };

  useEffect(() => {
    const parsedData: SensorData[] = rawStreamData
      .map((entry) => {
        try {
          return JSON.parse(entry) as SensorData;
        } catch {
          console.error("Invalid WebSocket message:", entry);
          return null;
        }
      })
      .filter((item): item is SensorData => item !== null);

    setStreamData(parsedData);
  }, [rawStreamData]);

  useEffect(() => {
    const loadPlotly = async () => {
      if (!plotlyRef.current) {
        plotlyRef.current = await import("plotly.js-basic-dist");
      }
      const Plotly = plotlyRef.current!;
      if (!streamData.length) return;

      const timestamps = streamData
        .map((d) => d.timestamp)
        .filter((timestamp): timestamp is number => timestamp !== undefined)
        .sort((a, b) => a - b)
        .map((t) => new Date(t));

      if (!timestamps.length) return;

      fieldsToGraph.forEach(({ key }) => {
        const graphDiv = graphRefs.current[key];
        if (!graphDiv) return;

        const lastDataPoint = streamData[streamData.length - 1];
        if (!lastDataPoint || !lastDataPoint.timestamp) return;
        const value = lastDataPoint[key as keyof SensorData] ?? 0;

        if (!uirevisionRef.current[key]) {
          uirevisionRef.current[key] = 1;
        }

        const layout: Partial<Layout> = {
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          xaxis: {
            title: "Time",
            color: "#ffffff",
            tickangle: -30,
            tickmode: "auto",
            tickformat: "%H:%M:%S",
            showgrid: true,
            gridcolor: "rgba(255,255,255,0.2)",
            tickfont: { size: 12 },
            type: "date",
            rangeslider: { visible: false } 
          },
          yaxis: {
            title: key,
            color: "#ffffff",
            showgrid: true,
            gridcolor: "rgba(255,255,255,0.2)",
          },
          autosize: true,
          margin: { t: 40, b: 80, l: 50, r: 20 },
          uirevision: uirevisionRef.current[key]
        };

        if (!graphDiv.hasAttribute("data-plotly")) {
          Plotly.newPlot(graphDiv, [{
            x: [],
            y: [],
            type: "scatter",
            mode: "lines",
            name: key,
            line: { width: 2 },
          }], layout);

          graphDiv.setAttribute("data-plotly", "true");
        }

        Plotly.extendTraces(
          graphDiv,
          { x: [[new Date(lastDataPoint.timestamp)]], y: [[value]] },
          [0],
          500
        );

        if (!manualZoom.current[key]) { 
          Plotly.relayout(graphDiv, { "xaxis.autorange": true });
        }
      });
    };

    loadPlotly();
  }, [streamData]);

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fieldsToGraph.map(({ key, title }) => (
          <Card key={key} className="min-h-[300px] h-[400px]">
            <>
              <div className="flex flex-wrap justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 max-w-[70%]">
                  {title}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(timeRanges).map((range) => (
                    <button 
                      key={range} 
                      onClick={() => handleRangeSelection(key, range)} 
                      className={`btn btn-xs ${selectedRange.current[key] === range ? "btn-primary" : "btn-secondary"}`}
                    >
                      {range}
                    </button>
                  ))}
                </div>
              </div>
              <div ref={(el) => setGraphRef(key, el)} style={{ width: "100%", height: "320px" }} />
            </>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default DynamicGraphs;
