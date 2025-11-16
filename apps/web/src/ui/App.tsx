import React from 'react';
import useSWR from 'swr';

type LeaderItem = {
	code: string;
	txCount: number;
	volumeEth: string;
	feeEstimateEth: string;
	appUrl: string | null;
	ownerAddress: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function openAppWithBuilderCode(targetUrl: string, builderCode: string) {
	const url = new URL(targetUrl);
	url.searchParams.set('builder', builderCode);

	// If inside Base Mini App environment, prefer native open
	// Fallback to window.open otherwise
	try {
		// @ts-ignore
		if (window?.BaseMiniApp?.openURL) {
			// @ts-ignore
			window.BaseMiniApp.openURL(url.toString());
		} else {
			window.open(url.toString(), '_blank', 'noopener,noreferrer');
		}
	} catch {
		window.open(url.toString(), '_blank', 'noopener,noreferrer');
	}
}

export const App: React.FC = () => {
	const { data } = useSWR<{ items: LeaderItem[] }>('/api/leaderboard', fetcher, {
		refreshInterval: 15_000
	});
	const items = data?.items ?? [];
	const ourBuilderCode = (import.meta as any).env?.VITE_BUILDER_CODE ?? 'builderscan';

	return (
		<div style={{ minHeight: '100dvh', background: '#0b1220', color: '#e5e7eb' }}>
			<div style={{ maxWidth: 960, margin: '0 auto', padding: '24px' }}>
				<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<h1 style={{ fontSize: 24, margin: 0 }}>BuilderScan</h1>
					<div style={{ opacity: 0.8, fontSize: 12 }}>Live explorer + leaderboard for builder codes</div>
				</header>
				<section style={{ marginTop: 24 }}>
					<table style={{ width: '100%', borderCollapse: 'collapse' }}>
						<thead>
							<tr style={{ textAlign: 'left', color: '#9ca3af' }}>
								<th style={{ padding: '8px 12px' }}>Rank</th>
								<th style={{ padding: '8px 12px' }}>Code</th>
								<th style={{ padding: '8px 12px' }}>Owner</th>
								<th style={{ padding: '8px 12px' }}>Tx</th>
								<th style={{ padding: '8px 12px' }}>Volume (ETH)</th>
								<th style={{ padding: '8px 12px' }}>Est. Fees (ETH)</th>
								<th style={{ padding: '8px 12px' }}>Open</th>
							</tr>
						</thead>
						<tbody>
							{items.map((it, idx) => (
								<tr key={it.code} style={{ borderTop: '1px solid #1f2937' }}>
									<td style={{ padding: '10px 12px' }}>{idx + 1}</td>
									<td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{it.code}</td>
									<td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
										{it.ownerAddress.slice(0, 6)}…{it.ownerAddress.slice(-4)}
									</td>
									<td style={{ padding: '10px 12px' }}>{it.txCount}</td>
									<td style={{ padding: '10px 12px' }}>{Number(it.volumeEth).toFixed(4)}</td>
									<td style={{ padding: '10px 12px' }}>{Number(it.feeEstimateEth).toFixed(6)}</td>
									<td style={{ padding: '10px 12px' }}>
										{it.appUrl ? (
											<button
												onClick={() => openAppWithBuilderCode(it.appUrl!, ourBuilderCode)}
												style={{
													background: '#2563eb',
													color: 'white',
													border: 0,
													padding: '8px 12px',
													borderRadius: 8,
													cursor: 'pointer'
												}}
											>
												Open
											</button>
										) : (
											<span style={{ color: '#9ca3af' }}>—</span>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
					{items.length === 0 && (
						<div style={{ marginTop: 32, color: '#9ca3af' }}>
							No data yet. Run the indexers to populate builder codes and attributions.
						</div>
					)}
				</section>
			</div>
		</div>
	);
};


