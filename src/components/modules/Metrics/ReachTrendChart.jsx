import React from 'react';
import { Card } from '@/components/ui/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const ReachTrendChart = ({ data }) => {
    if (!data || data.length === 0) {
        return (
            <Card className="h-[300px] flex items-center justify-center text-zinc-400 italic text-sm">
                No hay datos de tendencia disponibles.
            </Card>
        );
    }

    // Format dates for display
    const formattedData = data.map(d => ({
        ...d,
        displayDate: new Date(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    }));

    return (
        <Card className="p-6 h-[400px] shadow-none">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-6 uppercase tracking-wider">
                Tendencia de Alcance (Mes Actual)
            </h3>
            <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={formattedData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" opacity={0.5} />
                        <XAxis
                            dataKey="displayDate"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 10, fill: '#9ca3af' }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: '8px',
                                fontSize: '12px',
                                boxShadow: 'none'
                            }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
                        <Line
                            type="monotone"
                            dataKey="facebook"
                            name="Facebook"
                            stroke="#1877F2"
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="instagram"
                            name="Instagram"
                            stroke="#E1306C"
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};

export default ReachTrendChart;
