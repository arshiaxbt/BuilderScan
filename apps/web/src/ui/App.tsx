import React from 'react';
import useSWR from 'swr';
import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Generate ERC-8021 data suffix according to the specification
 * Format: {codes}{codesLength}{schemaId}{ercSuffix}
 * - codes: ASCII string, comma-delimited
 * - codesLength: 1 byte (length of codes string)
 * - schemaId: 1 byte (0 = canonical registry)
 * - ercSuffix: 16 bytes = 0x80218021802180218021802180218021
 */
function generateERC8021DataSuffix(codes: string[]): string {
	const codesStr = codes.join(',');
	const codesBytes = new TextEncoder().encode(codesStr);
	const codesLength = codesBytes.length;
	
	if (codesLength > 255) {
		throw new Error('Codes string too long (max 255 bytes)');
	}
	
	// ERC-8021 suffix: 16 bytes of 0x80218021802180218021802180218021
	const ercSuffix = new Uint8Array([
		0x80, 0x21, 0x80, 0x21, 0x80, 0x21, 0x80, 0x21,
		0x80, 0x21, 0x80, 0x21, 0x80, 0x21, 0x80, 0x21
	]);
	
	// Schema 0 (canonical registry)
	const schemaId = 0;
	
	// Build the suffix: codes + codesLength + schemaId + ercSuffix
	const suffix = new Uint8Array(codesLength + 1 + 1 + 16);
	let offset = 0;
	
	// codes
	suffix.set(codesBytes, offset);
	offset += codesLength;
	
	// codesLength
	suffix[offset] = codesLength;
	offset += 1;
	
	// schemaId
	suffix[offset] = schemaId;
	offset += 1;
	
	// ercSuffix
	suffix.set(ercSuffix, offset);
	
	// Convert to hex string
	return '0x' + Array.from(suffix).map(b => b.toString(16).padStart(2, '0')).join('');
}

type LeaderItem = {
	code: string;
	txCount: number;
	volumeEth: string;
	feeEstimateEth: string;
	appUrl: string | null;
	ownerAddress: string;
	likes?: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function openAppWithBuilderCode(targetUrl: string, builderCode: string) {
	try {
		const url = new URL(targetUrl);
		url.searchParams.set('builder', builderCode);
		// @ts-ignore
		if (window?.BaseMiniApp?.openURL) {
			// @ts-ignore
			window.BaseMiniApp.openURL(url.toString());
		} else {
			window.open(url.toString(), '_blank', 'noopener,noreferrer');
		}
	} catch (err) {
		console.error('Failed to open app:', err);
		alert('Invalid app URL');
	}
}

declare global {
	interface Window {
		ethereum?: any;
		BaseMiniApp?: {
			openURL?: (url: string) => void;
			sdk?: {
				actions?: {
					ready?: () => void;
				};
			};
		};
		sdk?: {
			actions?: {
				ready?: () => void;
			};
		};
	}
}

const BASE_CHAIN_ID_HEX = '0x2105'; // 8453
const BASE_BLUE = '#0000FF';
const BASE_BLUE_DARK = '#0000CC';

async function ensureBaseChain() {
	if (!window.ethereum) throw new Error('No EIP-1193 provider');
	const chainId: string = await window.ethereum.request({ method: 'eth_chainId' });
	if (chainId !== BASE_CHAIN_ID_HEX) {
		try {
			await window.ethereum.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: BASE_CHAIN_ID_HEX }]
			});
		} catch (switchError: any) {
			if (switchError.code === 4902) {
				// Chain not added, try to add it
				await window.ethereum.request({
					method: 'wallet_addEthereumChain',
					params: [{
						chainId: BASE_CHAIN_ID_HEX,
						chainName: 'Base',
						nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
						rpcUrls: ['https://mainnet.base.org'],
						blockExplorerUrls: ['https://basescan.org']
					}]
				});
			} else {
				throw switchError;
			}
		}
	}
}

function formatAddress(addr: string): string {
	if (!addr || addr.length < 10) return addr;
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatEth(value: string | number): string {
	const num = typeof value === 'string' ? Number(value) : value;
	if (num >= 1) return num.toFixed(2);
	if (num >= 0.01) return num.toFixed(4);
	return num.toFixed(6);
}

export const App: React.FC = () => {
	const { data, error, isLoading } = useSWR<{ items: LeaderItem[] }>('/api/leaderboard', fetcher, {
		refreshInterval: 15_000,
		revalidateOnFocus: true
	});
	const items = data?.items ?? [];
	const ourBuilderCode = (import.meta as any).env?.VITE_BUILDER_CODE ?? 'builderscan';
	const [account, setAccount] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState<string | null>(null);
	const [showOnboarding, setShowOnboarding] = React.useState(() => {
		// Show onboarding only on first visit
		return !localStorage.getItem('builderScanOnboarded');
	});

	// Call sdk.actions.ready() when app is loaded to dismiss splash screen
	// Per Farcaster Mini App docs: https://miniapps.farcaster.xyz/docs/getting-started#making-your-app-display
	React.useEffect(() => {
		// Call ready() after app is fully loaded
		const initializeSDK = async () => {
			try {
				await sdk.actions.ready();
			} catch (err) {
				// SDK might not be available outside Farcaster (e.g., in browser)
				console.warn('Farcaster Mini App SDK not available (running outside Farcaster):', err);
			}
		};

		initializeSDK();
	}, []);

	// Handle onboarding completion
	const handleOnboardingComplete = () => {
		setShowOnboarding(false);
		localStorage.setItem('builderScanOnboarded', 'true');
	};

	const connect = React.useCallback(async () => {
		if (!window.ethereum) {
			alert('No wallet detected. Please install a Base-compatible wallet like Coinbase Wallet or MetaMask.');
			return;
		}
		try {
			setLoading('connecting');
			await ensureBaseChain();
			const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' });
			if (accounts && accounts.length > 0) {
				setAccount(accounts[0]);
			}
		} catch (err: any) {
			console.error('Connection error:', err);
			alert(err?.message || 'Failed to connect wallet');
		} finally {
			setLoading(null);
		}
	}, []);

	const sendLikeTx = React.useCallback(async (ownerAddress: string, code: string) => {
		if (!window.ethereum) {
			alert('No wallet detected.');
			return;
		}
		if (!account) {
			alert('Please connect your wallet first.');
			return;
		}
		if (!ownerAddress || !/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
			alert('Invalid owner address');
			return;
		}
		try {
			setLoading(`like-${code}`);
			await ensureBaseChain();
			
			// Generate ERC-8021 data suffix
			const dataSuffix = generateERC8021DataSuffix([ourBuilderCode]);
			
			// Use wallet_sendCalls (ERC-5792) with dataSuffix capability
			// This works for both EOA and Smart Account (ERC-4337) users
			let txHash: string;
			try {
				// Try wallet_sendCalls first (recommended)
				const result = await window.ethereum.request({
					method: 'wallet_sendCalls',
					params: [{
						calls: [{
							to: ownerAddress,
							value: '0x0',
							data: '0x' // Empty data for like transaction
						}],
						capabilities: {
							dataSuffix: dataSuffix
						}
					}]
				});
				txHash = result as string;
			} catch (sendCallsError: any) {
				// Fallback to legacy eth_sendTransaction if wallet_sendCalls is not supported
				if (sendCallsError?.code === -32601 || sendCallsError?.message?.includes('not supported')) {
					// Legacy approach: manually append suffix
					const data = '0x' + dataSuffix.slice(2);
			const tx = {
				to: ownerAddress,
				value: '0x0',
				data
			};
					txHash = await window.ethereum.request({
				method: 'eth_sendTransaction',
				params: [tx]
			});
				} else {
					throw sendCallsError;
				}
			}
			
			// Update backend
			await fetch(`/api/interactions/${code}/like`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ delta: 1 })
			}).catch(() => {});
			alert(`Like transaction sent!\nTx Hash: ${txHash}`);
			window.location.reload();
		} catch (err: any) {
			console.error('Like tx error:', err);
			alert(err?.message || 'Failed to send like transaction');
		} finally {
			setLoading(null);
		}
	}, [ourBuilderCode, account]);

	const sendDonateTx = React.useCallback(async (ownerAddress: string, amountEth: string) => {
		if (!window.ethereum) {
			alert('No wallet detected.');
			return;
		}
		if (!account) {
			alert('Please connect your wallet first.');
			return;
		}
		const amount = Number(amountEth);
		if (!amount || amount <= 0 || !isFinite(amount)) {
			alert('Please enter a valid amount');
			return;
		}
		if (!ownerAddress || !/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
			alert('Invalid owner address');
			return;
		}
		try {
			setLoading(`donate-${ownerAddress}`);
			await ensureBaseChain();
			
			// Convert ETH to Wei (18 decimals)
			// Use proper conversion: 1 ETH = 10^18 Wei
			const valueWei = BigInt(Math.floor(amount * 1e18));
			
			// Generate ERC-8021 data suffix
			const dataSuffix = generateERC8021DataSuffix([ourBuilderCode]);
			
			// Use wallet_sendCalls (ERC-5792) with dataSuffix capability
			// This works for both EOA and Smart Account (ERC-4337) users
			let txHash: string;
			try {
				// Try wallet_sendCalls first (recommended)
				const result = await window.ethereum.request({
					method: 'wallet_sendCalls',
					params: [{
						calls: [{
							to: ownerAddress,
							value: '0x' + valueWei.toString(16),
							data: '0x' // Empty data, suffix will be appended by wallet
						}],
						capabilities: {
							dataSuffix: dataSuffix
						}
					}]
				});
				txHash = result as string;
			} catch (sendCallsError: any) {
				// Fallback to legacy eth_sendTransaction if wallet_sendCalls is not supported
				if (sendCallsError?.code === -32601 || sendCallsError?.message?.includes('not supported')) {
					// Legacy approach: manually append suffix
					const data = '0x' + dataSuffix.slice(2);
			const tx = {
				to: ownerAddress,
				value: '0x' + valueWei.toString(16),
				data
			};
					txHash = await window.ethereum.request({
				method: 'eth_sendTransaction',
				params: [tx]
			});
				} else {
					throw sendCallsError;
				}
			}
			
			alert(`Donation sent!\nAmount: ${amountEth} ETH\nTx Hash: ${txHash}`);
		} catch (err: any) {
			console.error('Donate tx error:', err);
			alert(err?.message || 'Failed to send donation');
		} finally {
			setLoading(null);
		}
	}, [ourBuilderCode, account]);

	return (
		<div style={{ 
			minHeight: '100svh', // Support for small viewport height (mobile/Base Mini App)
			background: '#000000', 
			color: '#FFFFFF',
			fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			overflowX: 'hidden'
		}}>
			<div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(16px, 4vw, 32px) clamp(16px, 4vw, 24px)' }}>
				{/* Header */}
				<header style={{ 
					display: 'flex', 
					justifyContent: 'space-between', 
					alignItems: 'center',
					marginBottom: 'clamp(24px, 6vw, 48px)',
					paddingBottom: 'clamp(16px, 4vw, 24px)',
					borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
					flexWrap: 'wrap',
					gap: 16
				}}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
						<img 
							src="/logo.png" 
							alt="BuilderScan Logo" 
							style={{ width: 'clamp(40px, 8vw, 56px)', height: 'clamp(40px, 8vw, 56px)', borderRadius: 12, objectFit: 'contain' }} 
						/>
						<div>
							<h1 style={{ 
								fontSize: 'clamp(24px, 5vw, 32px)', 
								margin: 0, 
								fontWeight: 600,
								letterSpacing: '-0.02em',
								lineHeight: 1.2
							}}>
								BuilderScan
							</h1>
							<p style={{ 
								margin: '6px 0 0 0', 
								fontSize: 'clamp(12px, 2.5vw, 14px)', 
								opacity: 0.7,
								fontWeight: 400,
								lineHeight: 1.4
							}}>
								Live explorer + leaderboard for ERC-8021 builder codes on Base
							</p>
						</div>
					</div>
					<button
						onClick={connect}
						disabled={loading === 'connecting'}
						style={{ 
							background: account ? 'rgba(255, 255, 255, 0.1)' : BASE_BLUE,
							color: '#FFFFFF', 
							border: 0, 
							padding: '12px 24px', 
							borderRadius: 8, 
							cursor: loading === 'connecting' ? 'wait' : 'pointer',
							fontSize: 14,
							fontWeight: 500,
							transition: 'all 0.2s',
							fontFamily: 'inherit',
							opacity: loading === 'connecting' ? 0.6 : 1
						}}
						onMouseEnter={(e) => {
							if (!account && loading !== 'connecting') {
								e.currentTarget.style.background = BASE_BLUE_DARK;
							}
						}}
						onMouseLeave={(e) => {
							if (!account && loading !== 'connecting') {
								e.currentTarget.style.background = BASE_BLUE;
							}
						}}
					>
						{loading === 'connecting' ? 'Connecting...' : account ? formatAddress(account) : 'Connect Wallet'}
					</button>
				</header>

				{/* Leaderboard */}
				<section>
					{isLoading ? (
						<div style={{ 
							marginTop: 64, 
							textAlign: 'center',
							color: 'rgba(255, 255, 255, 0.6)',
							fontSize: 16
						}}>
							Loading leaderboard...
						</div>
					) : error ? (
						<div style={{ 
							marginTop: 64, 
							textAlign: 'center',
							color: 'rgba(255, 100, 100, 0.8)',
							fontSize: 16
						}}>
							Failed to load leaderboard. Please refresh the page.
						</div>
					) : items.length === 0 ? (
						<div style={{ 
							marginTop: 64, 
							textAlign: 'center',
							color: 'rgba(255, 255, 255, 0.6)',
							fontSize: 16
						}}>
							No ERC-8021 transactions found yet. The indexer scans Base blockchain every 5 minutes.
							<br />
							<small style={{ fontSize: 14, opacity: 0.7, marginTop: 8, display: 'block', marginBottom: 16 }}>
								Leaderboard will populate as transactions with ERC-8021 attribution are discovered.
							</small>
							<button
								onClick={async () => {
									try {
										const res = await fetch('/api/index');
										const data = await res.json();
										if (data.success) {
											alert(`Indexer ran successfully!\nScanned ${data.scannedBlocks} blocks\nFound ${data.attributions} attributions\n\nRefresh the page to see results.`);
											// Refresh data
											window.location.reload();
										} else {
											alert('Indexer error: ' + (data.message || data.error || 'Unknown error'));
										}
									} catch (err: any) {
										alert('Failed to trigger indexer: ' + (err.message || 'Unknown error'));
									} finally {
									}
								}}
								disabled={indexing}
								style={{
									background: BASE_BLUE,
									color: 'white',
									border: 'none',
									borderRadius: 8,
									padding: '12px 24px',
									fontSize: 14,
									fontWeight: 600,
									cursor: indexing ? 'not-allowed' : 'pointer',
									opacity: indexing ? 0.6 : 1,
									transition: 'all 0.2s'
								}}
							>
						</div>
					) : (
						<div style={{ display: 'grid', gap: 16 }}>
							{items.map((it, idx) => {
								const isLikeLoading = loading === `like-${it.code}`;
								const isDonateLoading = loading === `donate-${it.ownerAddress}`;
								return (
									<div
										key={it.code}
										style={{
											background: 'rgba(255, 255, 255, 0.05)',
											border: '1px solid rgba(255, 255, 255, 0.1)',
											borderRadius: 16,
											padding: 24,
											transition: 'all 0.2s'
										}}
										onMouseEnter={(e) => {
											e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
											e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
										}}
										onMouseLeave={(e) => {
											e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
											e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
										}}
									>
										<div style={{ 
											display: 'flex',
											flexDirection: 'row',
											justifyContent: 'space-between',
											alignItems: 'flex-start',
											gap: 'clamp(16px, 4vw, 24px)',
											width: '100%',
											flexWrap: 'wrap'
										}}>
											{/* Left: Rank and Code */}
											<div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
												<div style={{
													width: 56,
													height: 56,
													borderRadius: 12,
													background: idx < 3 ? BASE_BLUE : 'rgba(255, 255, 255, 0.1)',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													fontSize: 22,
													fontWeight: 700,
													color: '#FFFFFF',
													flexShrink: 0
												}}>
													#{idx + 1}
												</div>
												<div>
													<div style={{ 
														fontSize: 22, 
														fontWeight: 600, 
														marginBottom: 6,
														fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
														letterSpacing: '0.02em'
													}}>
														{it.code}
													</div>
													<div style={{ 
														fontSize: 13, 
														opacity: 0.6,
														fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'
													}}>
														{formatAddress(it.ownerAddress)}
													</div>
												</div>
											</div>

											{/* Center: Stats */}
											<div style={{ 
												display: 'grid', 
												gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
												gap: 'clamp(8px, 2vw, 24px)',
												flex: '1 1 auto',
												minWidth: 180,
												maxWidth: 450,
												width: '100%'
											}}>
												<div style={{ minWidth: 0, overflow: 'hidden' }}>
													<div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, whiteSpace: 'nowrap' }}>
														Transactions
													</div>
													<div style={{ fontSize: 'clamp(16px, 3vw, 20px)', fontWeight: 600, whiteSpace: 'nowrap' }}>
														{it.txCount.toLocaleString()}
													</div>
												</div>
												<div style={{ minWidth: 0, overflow: 'hidden' }}>
													<div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, whiteSpace: 'nowrap' }}>
														Volume
													</div>
													<div style={{ fontSize: 'clamp(16px, 3vw, 20px)', fontWeight: 600, whiteSpace: 'nowrap' }}>
														{formatEth(it.volumeEth)} ETH
													</div>
												</div>
												<div style={{ minWidth: 0, overflow: 'hidden' }}>
													<div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, whiteSpace: 'nowrap' }}>
														Est. Fees
													</div>
													<div style={{ fontSize: 'clamp(16px, 3vw, 20px)', fontWeight: 600, whiteSpace: 'nowrap' }}>
														{formatEth(it.feeEstimateEth)} ETH
													</div>
												</div>
											</div>

											{/* Right: Actions */}
											<div style={{ 
												display: 'flex', 
												alignItems: 'center', 
												gap: 12, 
												flexShrink: 0, 
												flexWrap: 'wrap',
												justifyContent: 'flex-end',
												minWidth: 0
											}}>
												{/* Likes */}
												<div style={{ 
													display: 'flex', 
													alignItems: 'center', 
													gap: 8,
													padding: '8px 12px',
													background: 'rgba(255, 255, 255, 0.05)',
													borderRadius: 10
												}}>
													<span style={{ fontSize: 16, fontWeight: 600, minWidth: 24 }}>{it.likes ?? 0}</span>
													<button
														onClick={() => sendLikeTx(it.ownerAddress, it.code)}
														disabled={!account || isLikeLoading}
														style={{ 
															background: 'transparent',
															color: account && !isLikeLoading ? BASE_BLUE : 'rgba(255, 255, 255, 0.4)',
															border: `1px solid ${account && !isLikeLoading ? BASE_BLUE : 'rgba(255, 255, 255, 0.2)'}`,
															padding: '6px 14px',
															borderRadius: 8,
															cursor: account && !isLikeLoading ? 'pointer' : 'not-allowed',
															fontSize: 13,
															fontWeight: 500,
															transition: 'all 0.2s',
															fontFamily: 'inherit',
															opacity: isLikeLoading ? 0.6 : 1
														}}
														onMouseEnter={(e) => {
															if (account && !isLikeLoading) {
																e.currentTarget.style.background = BASE_BLUE;
																e.currentTarget.style.color = '#FFFFFF';
															}
														}}
														onMouseLeave={(e) => {
															if (account && !isLikeLoading) {
																e.currentTarget.style.background = 'transparent';
																e.currentTarget.style.color = BASE_BLUE;
															}
														}}
													>
														{isLikeLoading ? '...' : '❤️ Like'}
													</button>
												</div>

												{/* Donate */}
												<form
													onSubmit={async (e) => {
														e.preventDefault();
														const form = e.currentTarget as HTMLFormElement;
														const input = form.elements.namedItem('amt') as HTMLInputElement;
														const amountEth = input.value;
														if (!amountEth) return;
														await sendDonateTx(it.ownerAddress, amountEth);
														input.value = '';
													}}
													style={{ display: 'flex', gap: 8, alignItems: 'center' }}
												>
													<input
														name="amt"
														type="number"
														min="0"
														step="0.0001"
														placeholder="0.01"
														disabled={!account || isDonateLoading}
														style={{ 
															width: 100, 
															padding: '8px 12px', 
															borderRadius: 8, 
															border: '1px solid rgba(255, 255, 255, 0.2)',
															background: 'rgba(255, 255, 255, 0.05)',
															color: '#FFFFFF',
															fontSize: 14,
															fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
															outline: 'none',
															opacity: account && !isDonateLoading ? 1 : 0.5
														}}
													/>
													<button
														type="submit"
														disabled={!account || isDonateLoading}
														style={{ 
															background: account && !isDonateLoading ? BASE_BLUE : 'rgba(255, 255, 255, 0.1)',
															color: '#FFFFFF', 
															border: 0, 
															padding: '8px 16px', 
															borderRadius: 8, 
															cursor: account && !isDonateLoading ? 'pointer' : 'not-allowed',
															fontSize: 14,
															fontWeight: 500,
															transition: 'all 0.2s',
															fontFamily: 'inherit',
															opacity: isDonateLoading ? 0.6 : 1
														}}
														onMouseEnter={(e) => {
															if (account && !isDonateLoading) e.currentTarget.style.background = BASE_BLUE_DARK;
														}}
														onMouseLeave={(e) => {
															if (account && !isDonateLoading) e.currentTarget.style.background = BASE_BLUE;
														}}
													>
														{isDonateLoading ? '...' : 'Donate'}
													</button>
												</form>

												{/* Open App */}
												{it.appUrl && (
													<button
														onClick={() => openAppWithBuilderCode(it.appUrl!, ourBuilderCode)}
														style={{
															background: 'transparent',
															color: BASE_BLUE,
															border: `1px solid ${BASE_BLUE}`,
															padding: '8px 16px',
															borderRadius: 8,
															cursor: 'pointer',
															fontSize: 14,
															fontWeight: 500,
															transition: 'all 0.2s',
															fontFamily: 'inherit'
														}}
														onMouseEnter={(e) => {
															e.currentTarget.style.background = BASE_BLUE;
															e.currentTarget.style.color = '#FFFFFF';
														}}
														onMouseLeave={(e) => {
															e.currentTarget.style.background = 'transparent';
															e.currentTarget.style.color = BASE_BLUE;
														}}
													>
														Open →
													</button>
												)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>

				{/* Creator & Socials */}
				<footer style={{
					marginTop: 'clamp(48px, 10vw, 80px)',
					paddingTop: 'clamp(32px, 6vw, 48px)',
					borderTop: '1px solid rgba(255, 255, 255, 0.1)',
					textAlign: 'center'
				}}>
					<div style={{ marginBottom: 16 }}>
						<div style={{ fontSize: 14, opacity: 0.6, marginBottom: 12 }}>
							Built by
						</div>
						<div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
							arshiags.eth
						</div>
					</div>
					<div style={{ 
						display: 'flex', 
						justifyContent: 'center', 
						alignItems: 'center', 
						gap: 20,
						flexWrap: 'wrap'
					}}>
						{/* X (Twitter) */}
						<a
							href="https://x.com/ArshiaXBT"
							target="_blank"
							rel="noopener noreferrer"
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 44,
								height: 44,
								borderRadius: 12,
								background: 'rgba(255, 255, 255, 0.05)',
								border: '1px solid rgba(255, 255, 255, 0.1)',
								transition: 'all 0.2s',
								textDecoration: 'none'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
								e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
								e.currentTarget.style.transform = 'translateY(-2px)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
								e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
								e.currentTarget.style.transform = 'translateY(0)';
							}}
						>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#FFFFFF' }}>
								<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
							</svg>
						</a>

						{/* Farcaster */}
						<a
							href="https://farcaster.xyz/arshiags"
							target="_blank"
							rel="noopener noreferrer"
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 44,
								height: 44,
								borderRadius: 12,
								background: 'rgba(255, 255, 255, 0.05)',
								border: '1px solid rgba(255, 255, 255, 0.1)',
								transition: 'all 0.2s',
								textDecoration: 'none'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
								e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
								e.currentTarget.style.transform = 'translateY(-2px)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
								e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
								e.currentTarget.style.transform = 'translateY(0)';
							}}
						>
							<img 
								src="/farcaster-logo.png" 
								alt="Farcaster" 
								style={{ width: 20, height: 20, objectFit: 'contain' }}
							/>
						</a>

						{/* GitHub */}
						<a
							href="https://github.com/arshiaxbt/BuilderScan"
							target="_blank"
							rel="noopener noreferrer"
							style={{
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								width: 44,
								height: 44,
								borderRadius: 12,
								background: 'rgba(255, 255, 255, 0.05)',
								border: '1px solid rgba(255, 255, 255, 0.1)',
								transition: 'all 0.2s',
								textDecoration: 'none'
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
								e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
								e.currentTarget.style.transform = 'translateY(-2px)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
								e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
								e.currentTarget.style.transform = 'translateY(0)';
							}}
						>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#FFFFFF' }}>
								<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
							</svg>
						</a>
					</div>
				</footer>
			</div>
		</div>
	);
};
