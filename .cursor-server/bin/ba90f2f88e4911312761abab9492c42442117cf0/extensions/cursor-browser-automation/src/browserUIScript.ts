/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Anysphere. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/**
 * Generate the minimal browser UI injection script for element selection.
 * This script runs in the browser page context and handles:
 * - Element selection UI with visual overlays
 * - Escape key handling in selection mode
 *
 * Note: Keyboard shortcuts are handled by Electron's globalShortcut API in the main process.
 * Note: Console logging is captured natively by Electron's console-message event.
 */
export function generateBrowserUIScript(tabId: string): string {
	return `
(function() {
	// Prevent double injection
	if (window.__cursorBrowserAutomationInjected) {
		return;
	}

	// Only inject in top-level frame
	if (window !== window.top) {
		return;
	}

	window.__cursorBrowserAutomationInjected = true;

	const tabId = ${JSON.stringify(tabId)};

	// =============================================================================
	// Element Selection System
	// =============================================================================

	let selectionMode = false;
	let cursorStyleOverride = null;
	let selectionCursor = null;
	let overlay = null;
	let overlayLabel = null;
	let dragSelectionBox = null;
	let isDragging = false;
	let dragStartX = null;
	let dragStartY = null;

	// Store element selection listeners for cleanup
	let elementSelectionListeners = null;

	// =============================================================================
	// React DevTools Integration
	// =============================================================================

	/**
	 * Check if we're on localhost (for showing React component names)
	 */
	function isLocalhost() {
		const hostname = window.location.hostname;
		return hostname === 'localhost' || hostname === '127.0.0.1';
	}

	/**
	 * Get React component information for a DOM element
	 * This mimics React DevTools functionality to identify component names
	 */
	function getReactComponentInfo(element) {
		if (!element || typeof element !== 'object') {
			return null;
		}

		try {
			// React 16+ uses Fiber architecture
			// React stores fiber nodes on DOM elements with keys like:
			// - __reactFiber$<randomId> (React 16+)
			// - __reactInternalInstance$<randomId> (React 15 and below)
			const reactKey = Object.keys(element).find(key =>
				key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
			);

			if (!reactKey) {
				return null;
			}

			const fiber = element[reactKey];
			if (!fiber) {
				return null;
			}

			// Walk up the fiber tree to find the component instance
			let currentFiber = fiber;
			let componentName = null;
			let componentType = null;
			let componentProps = null;

			// Traverse up to find the nearest component fiber
			while (currentFiber) {
				const type = currentFiber.type;
				const elementType = currentFiber.elementType;

				// Helper function to extract component name from a type
				const getComponentNameFromType = (typeToCheck) => {
					if (!typeToCheck) return null;

					if (typeof typeToCheck === 'function') {
						return typeToCheck.displayName || typeToCheck.name || null;
					} else if (typeof typeToCheck === 'object' && typeToCheck !== null) {
						// Handle React.memo, React.forwardRef, etc.
						if (typeToCheck.$$typeof) {
							// React.forwardRef
							if (typeToCheck.render) {
								return typeToCheck.render.displayName || typeToCheck.render.name || 'ForwardRef';
							}
							// React.memo
							if (typeToCheck.type) {
								return getComponentNameFromType(typeToCheck.type) || 'Memo';
							}
						}
					}
					return null;
				};

				// Check if this is a component fiber (not a host element like div, span, etc.)
				// Prefer elementType for React 16.8+ (handles memoized components better)
				const typeToCheck = elementType || type;

				if (typeToCheck && typeof typeToCheck !== 'string') {
					// This is a component
					componentType = typeToCheck;
					componentName = getComponentNameFromType(typeToCheck);

					// If we didn't get a name from elementType, try the regular type
					if (!componentName && elementType && type && elementType !== type) {
						componentName = getComponentNameFromType(type);
					}

					// Get props
					if (currentFiber.memoizedProps) {
						componentProps = currentFiber.memoizedProps;
					} else if (currentFiber.pendingProps) {
						componentProps = currentFiber.pendingProps;
					}

					// If we found a component name, we're done
					if (componentName) {
						break;
					}
				}

				// Move to parent fiber
				currentFiber = currentFiber.return;
			}

			if (!componentName) {
				return null;
			}

			// On production/minified sites, component names might be single letters like 'n', 't', etc.
			// Only return React component info if we're on localhost or if the name looks meaningful
			const isMeaningfulName = componentName.length > 1 && /^[A-Z]/.test(componentName);
			if (!isLocalhost() && !isMeaningfulName) {
				return null;
			}

			const serializedProps = componentProps ? Object.keys(componentProps).reduce((acc, key) => {
				// Only include serializable props (exclude functions, objects, etc.)
				const value = componentProps[key];
				if (value === null || value === undefined) {
					acc[key] = value;
				} else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
					acc[key] = value;
				} else if (Array.isArray(value)) {
					acc[key] = '[Array]';
				} else if (typeof value === 'object') {
					acc[key] = '[Object]';
				} else {
					acc[key] = '[Function]';
				}
				return acc;
			}, {}) : null;

			return {
				name: componentName,
				type: componentType,
				props: serializedProps
			};
		} catch (e) {
			// Silently fail if React detection fails
			return null;
		}
	}

	function createSelectionCursor() {
		const svgNS = 'http://www.w3.org/2000/svg';
		const cursor = document.createElementNS(svgNS, 'svg');
		cursor.setAttribute('width', '16');
		cursor.setAttribute('height', '16');
		cursor.setAttribute('viewBox', '0 0 16 16');
		cursor.setAttribute('fill', 'none');
		cursor.setAttribute('data-cursor-overlay', 'true');
		cursor.setAttribute('aria-hidden', 'true');
		cursor.setAttribute('focusable', 'false');
		cursor.style.position = 'fixed';
		cursor.style.pointerEvents = 'none';
		cursor.style.zIndex = '2147483646';
		cursor.style.transform = 'translate(-50%, -50%)';
		cursor.style.left = '-1000px';
		cursor.style.top = '-1000px';

		const title = document.createElementNS(svgNS, 'title');
		title.textContent = 'Cursor overlay';
		cursor.appendChild(title);

		const gClip = document.createElementNS(svgNS, 'g');
		gClip.setAttribute('clip-path', 'url(#clip0_4213_106761)');

		const gFilter = document.createElementNS(svgNS, 'g');
		gFilter.setAttribute('filter', 'url(#filter0_d_4213_106761)');

		const path = document.createElementNS(svgNS, 'path');
		path.setAttribute('d', 'M1.68066 2.14282C1.5253 1.49746 2.16954 0.975576 2.75195 1.21118L2.86816 1.26782L3.11035 1.41333L12.958 7.27954L13.2031 7.42505C13.8128 7.78856 13.682 8.70779 12.9951 8.88696L12.7197 8.95825L8.28223 10.1155L6.16895 13.9592L6.02148 14.2288C5.66933 14.869 4.71301 14.741 4.54199 14.0305L4.4707 13.7317L1.74707 2.41724L1.68066 2.14282Z');
		path.setAttribute('fill', 'black');
		path.setAttribute('stroke', 'white');

		gFilter.appendChild(path);
		gClip.appendChild(gFilter);

		const defs = document.createElementNS(svgNS, 'defs');
		const filter = document.createElementNS(svgNS, 'filter');
		filter.setAttribute('id', 'filter0_d_4213_106761');
		filter.setAttribute('x', '-1.51042');
		filter.setAttribute('y', '-1.34839');
		filter.setAttribute('width', '18.2708');
		filter.setAttribute('height', '19.8255');
		filter.setAttribute('filterUnits', 'userSpaceOnUse');
		filter.setAttribute('color-interpolation-filters', 'sRGB');

		const feFlood = document.createElementNS(svgNS, 'feFlood');
		feFlood.setAttribute('flood-opacity', '0');
		feFlood.setAttribute('result', 'BackgroundImageFix');
		filter.appendChild(feFlood);

		const feColorMatrix1 = document.createElementNS(svgNS, 'feColorMatrix');
		feColorMatrix1.setAttribute('in', 'SourceAlpha');
		feColorMatrix1.setAttribute('type', 'matrix');
		feColorMatrix1.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
		feColorMatrix1.setAttribute('result', 'hardAlpha');
		filter.appendChild(feColorMatrix1);

		const feOffset = document.createElementNS(svgNS, 'feOffset');
		feOffset.setAttribute('dy', '0.666667');
		filter.appendChild(feOffset);

		const feGaussianBlur = document.createElementNS(svgNS, 'feGaussianBlur');
		feGaussianBlur.setAttribute('stdDeviation', '1.33333');
		filter.appendChild(feGaussianBlur);

		const feComposite = document.createElementNS(svgNS, 'feComposite');
		feComposite.setAttribute('in2', 'hardAlpha');
		feComposite.setAttribute('operator', 'out');
		filter.appendChild(feComposite);

		const feColorMatrix2 = document.createElementNS(svgNS, 'feColorMatrix');
		feColorMatrix2.setAttribute('type', 'matrix');
		feColorMatrix2.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0');
		filter.appendChild(feColorMatrix2);

		const feBlend1 = document.createElementNS(svgNS, 'feBlend');
		feBlend1.setAttribute('mode', 'normal');
		feBlend1.setAttribute('in2', 'BackgroundImageFix');
		feBlend1.setAttribute('result', 'effect1_dropShadow_4213_106761');
		filter.appendChild(feBlend1);

		const feBlend2 = document.createElementNS(svgNS, 'feBlend');
		feBlend2.setAttribute('mode', 'normal');
		feBlend2.setAttribute('in', 'SourceGraphic');
		feBlend2.setAttribute('in2', 'effect1_dropShadow_4213_106761');
		feBlend2.setAttribute('result', 'shape');
		filter.appendChild(feBlend2);

		defs.appendChild(filter);

		const clipPath = document.createElementNS(svgNS, 'clipPath');
		clipPath.setAttribute('id', 'clip0_4213_106761');
		const rect = document.createElementNS(svgNS, 'rect');
		rect.setAttribute('width', '16');
		rect.setAttribute('height', '16');
		rect.setAttribute('fill', 'white');
		clipPath.appendChild(rect);
		defs.appendChild(clipPath);

		cursor.appendChild(gClip);
		cursor.appendChild(defs);

		return cursor;
	}

	function showToast(message) {
		try {
			const toast = document.createElement('div');
			toast.textContent = message;
			toast.style.position = 'fixed';
			toast.style.bottom = '16px';
			toast.style.right = '16px';
			toast.style.background = 'rgba(0, 0, 0, 0.85)';
			toast.style.color = 'rgba(255, 255, 255, 0.95)';
			toast.style.padding = '6px 10px';
			toast.style.borderRadius = '3px';
			toast.style.fontSize = '12px';
			toast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
			toast.style.fontWeight = '400';
			toast.style.zIndex = '2147483647';
			toast.style.pointerEvents = 'none';
			toast.style.opacity = '0';
			toast.style.transition = 'opacity 150ms ease';

			document.body.appendChild(toast);

			requestAnimationFrame(() => {
				toast.style.opacity = '1';
			});

			setTimeout(() => {
				toast.style.opacity = '0';
				setTimeout(() => {
					if (toast.parentNode) {
						toast.parentNode.removeChild(toast);
					}
				}, 150);
			}, 2000);
		} catch (e) {
			// Silently fail
		}
	}

	function enableElementSelection() {
		if (elementSelectionListeners) {
			return;
		}

		selectionMode = true;
		document.body.style.cursor = 'none';

		if (!cursorStyleOverride) {
			cursorStyleOverride = document.createElement('style');
			cursorStyleOverride.textContent = '* { cursor: none !important; }';
			document.head.appendChild(cursorStyleOverride);
		}

		if (!selectionCursor) {
			selectionCursor = createSelectionCursor();
			document.body.appendChild(selectionCursor);
		}

		if (!overlay) {
			overlay = document.createElement('div');
			overlay.style.cssText = 'position:fixed;background:rgba(58,150,221,0.3);border:2px solid #3a96dd;pointer-events:none;z-index:2147483647;transition:all 0.1s ease;';
			document.body.appendChild(overlay);

			overlayLabel = document.createElement('div');
			overlayLabel.style.cssText = 'position:fixed;background:#3a96dd;color:white;padding:2px 6px;font-size:11px;font-family:system-ui,-apple-system,sans-serif;font-weight:500;border-radius:2px;pointer-events:none;z-index:2147483648;transition:all 0.1s ease;white-space:nowrap;';
			document.body.appendChild(overlayLabel);
		}

		const mousedownListener = (e) => {
			if (!selectionMode) return;
			e.preventDefault();
			e.stopPropagation();

			isDragging = true;
			dragStartX = e.clientX;
			dragStartY = e.clientY;

			if (overlay) {
				overlay.style.display = 'none';
			}
			if (overlayLabel) {
				overlayLabel.style.display = 'none';
			}

			if (!dragSelectionBox) {
				dragSelectionBox = document.createElement('div');
				dragSelectionBox.style.cssText = 'position:fixed;background:rgba(58,150,221,0.1);border:2px dashed #3a96dd;pointer-events:none;z-index:2147483647;';
				document.body.appendChild(dragSelectionBox);
			}
			dragSelectionBox.style.left = dragStartX + 'px';
			dragSelectionBox.style.top = dragStartY + 'px';
			dragSelectionBox.style.width = '0px';
			dragSelectionBox.style.height = '0px';
		};

		const mousemoveListener = (e) => {
			if (!selectionMode) return;

			if (selectionCursor) {
				selectionCursor.style.left = e.clientX + 'px';
				selectionCursor.style.top = e.clientY + 'px';
			}

			if (isDragging && dragSelectionBox) {
				const currentX = e.clientX;
				const currentY = e.clientY;

				const left = Math.min(dragStartX, currentX);
				const top = Math.min(dragStartY, currentY);
				const width = Math.abs(currentX - dragStartX);
				const height = Math.abs(currentY - dragStartY);

				dragSelectionBox.style.left = left + 'px';
				dragSelectionBox.style.top = top + 'px';
				dragSelectionBox.style.width = width + 'px';
				dragSelectionBox.style.height = height + 'px';
			} else if (!isDragging && overlay && overlayLabel) {
				const element = document.elementFromPoint(e.clientX, e.clientY);
				if (element && element !== overlay && element !== overlayLabel && element !== selectionCursor && element !== dragSelectionBox) {
					const rect = element.getBoundingClientRect();
					overlay.style.display = '';
					overlay.style.left = rect.left + 'px';
					overlay.style.top = rect.top + 'px';
					overlay.style.width = rect.width + 'px';
					overlay.style.height = rect.height + 'px';

					// Try to get React component info (only on localhost)
					const reactInfo = isLocalhost() ? getReactComponentInfo(element) : null;
					let labelText = element.tagName.toLowerCase();
					if (reactInfo && reactInfo.name) {
						labelText = reactInfo.name;
					}

					overlayLabel.style.display = '';
					overlayLabel.textContent = labelText;

					const labelTop = rect.top > 20 ? rect.top - 20 : rect.top + 2;
					overlayLabel.style.left = rect.left + 'px';
					overlayLabel.style.top = labelTop + 'px';
				}
			}
		};

		const mouseupListener = (e) => {
			if (!selectionMode) return;
			e.preventDefault();
			e.stopPropagation();

			if (isDragging) {
				const currentX = e.clientX;
				const currentY = e.clientY;

				const left = Math.min(dragStartX, currentX);
				const top = Math.min(dragStartY, currentY);
				const width = Math.abs(currentX - dragStartX);
				const height = Math.abs(currentY - dragStartY);

				if (width > 5 || height > 5) {
					const bounds = {
						x: Math.round(left),
						y: Math.round(top),
						width: Math.round(width),
						height: Math.round(height)
					};

					if (dragSelectionBox) {
						dragSelectionBox.remove();
						dragSelectionBox = null;
					}

					disableElementSelection();

					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							if (window.cursorBrowser) {
								window.cursorBrowser.send('area-screenshot-selected', {
									bounds: bounds
								});
							}

							enableElementSelection();
						});
					});
				} else {
					if (dragSelectionBox) {
						dragSelectionBox.remove();
						dragSelectionBox = null;
					}
				}

				isDragging = false;
			}
		};

		const clickListener = (e) => {
			if (!selectionMode) return;
			e.preventDefault();
			e.stopPropagation();

			const isMultiSelect = e.shiftKey === true;
			const element = e.target;
			const rect = element.getBoundingClientRect();
			const computedStyle = window.getComputedStyle(element);

			if (isMultiSelect && overlay && overlayLabel) {
				overlay.style.display = '';
				overlay.style.left = rect.left + 'px';
				overlay.style.top = rect.top + 'px';
				overlay.style.width = rect.width + 'px';
				overlay.style.height = rect.height + 'px';

				// Try to get React component info (only on localhost)
				const reactInfo = isLocalhost() ? getReactComponentInfo(element) : null;
				let overlayLabelText = element.tagName.toLowerCase();
				if (reactInfo && reactInfo.name) {
					overlayLabelText = reactInfo.name;
				}

				overlayLabel.style.display = '';
				overlayLabel.textContent = overlayLabelText;

				const overlayLabelTop = rect.top > 20 ? rect.top - 20 : rect.top + 2;
				overlayLabel.style.left = rect.left + 'px';
				overlayLabel.style.top = overlayLabelTop + 'px';
			}

			const path = [];
			let el = element;
			while (el && el !== document.body) {
				let selector = el.tagName.toLowerCase();
				if (el.id) {
					selector += '#' + el.id;
				} else if (el.className) {
					selector += '.' + el.className.split(' ').join('.');
				}
				path.unshift(selector);
				el = el.parentElement;
			}

			const tagName = element.tagName.toLowerCase();
			// Only get React component info on localhost or if it would be meaningful
			const reactInfo = getReactComponentInfo(element);
			const elementDesc = reactInfo && reactInfo.name
				? reactInfo.name
				: (element.id ? \`<\${tagName}#\${element.id}>\` : \`<\${tagName}>\`);
			showToast(\`Element \${elementDesc} added to chat\`);

			if (window.cursorBrowser) {
				const elementData = {
					tagName: element.tagName,
					id: element.id,
					className: element.className,
					innerText: element.innerText ? element.innerText.substring(0, 200) : '',
					innerHTML: element.innerHTML ? element.innerHTML.substring(0, 200) : '',
					path: path.join(' > '),
					attributes: Array.from(element.attributes || []).map(a => ({
						name: a.name,
						value: a.value
					})),
					rect: {
						top: rect.top,
						left: rect.left,
						width: rect.width,
						height: rect.height
					},
					styles: {
						color: computedStyle.color,
						backgroundColor: computedStyle.backgroundColor,
						fontSize: computedStyle.fontSize,
						fontFamily: computedStyle.fontFamily,
						display: computedStyle.display,
						position: computedStyle.position
					},
					keepSelectionActive: isMultiSelect
				};

				// Add React component information if available (already filtered by getReactComponentInfo)
				if (reactInfo) {
					elementData.reactComponent = {
						name: reactInfo.name,
						props: reactInfo.props
					};
				}

				window.cursorBrowser.send('element-selected', elementData);

				if (!isMultiSelect) {
					window.cursorBrowser.send('element-selection-complete', {});
				}
			}

			if (!isMultiSelect) {
				disableElementSelection();
			}
		};

		document.addEventListener('mousedown', mousedownListener, true);
		document.addEventListener('mousemove', mousemoveListener);
		document.addEventListener('mouseup', mouseupListener, true);
		document.addEventListener('click', clickListener, true);

		elementSelectionListeners = {
			mousedown: mousedownListener,
			mousemove: mousemoveListener,
			mouseup: mouseupListener,
			click: clickListener
		};
	}

	function disableElementSelection() {
		selectionMode = false;
		document.body.style.cursor = '';

		if (cursorStyleOverride) {
			cursorStyleOverride.remove();
			cursorStyleOverride = null;
		}
		if (selectionCursor) {
			selectionCursor.remove();
			selectionCursor = null;
		}
		if (overlay) {
			overlay.remove();
			overlay = null;
		}
		if (overlayLabel) {
			overlayLabel.remove();
			overlayLabel = null;
		}
		if (dragSelectionBox) {
			dragSelectionBox.remove();
			dragSelectionBox = null;
		}

		if (elementSelectionListeners) {
			const { mousedown, mousemove, mouseup, click } = elementSelectionListeners;
			document.removeEventListener('mousedown', mousedown, true);
			document.removeEventListener('mousemove', mousemove);
			document.removeEventListener('mouseup', mouseup, true);
			document.removeEventListener('click', click, true);
			elementSelectionListeners = null;
		}

		isDragging = false;
		dragStartX = null;
		dragStartY = null;
	}

	window.addEventListener('message', (e) => {
		if (e.data.type === 'enable-element-selection') {
			enableElementSelection();
		} else if (e.data.type === 'disable-element-selection') {
			disableElementSelection();
		}
	});

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && selectionMode) {
			e.preventDefault();
			e.stopPropagation();
			window.postMessage({ type: 'disable-element-selection' }, '*');
			return;
		}

		const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
		const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

		if (cmdOrCtrl && !e.altKey) {
			if (e.key === 'a' && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();

				const target = e.target;
				if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
					target.select();
				} else if (target instanceof HTMLElement && target.isContentEditable) {
					const selection = window.getSelection();
					const range = document.createRange();
					range.selectNodeContents(target);
					selection?.removeAllRanges();
					selection?.addRange(range);
				} else {
					document.execCommand('selectAll');
				}
				return;
			}
		}
	}, true);

})();
`;
}
