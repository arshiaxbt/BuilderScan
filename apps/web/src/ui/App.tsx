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
