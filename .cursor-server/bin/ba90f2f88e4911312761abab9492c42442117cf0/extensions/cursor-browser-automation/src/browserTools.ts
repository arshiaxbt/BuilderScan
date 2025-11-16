/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Anysphere. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CursorIDEBrowserLogger } from './logger.js';

// Configuration for large snapshot handling
const SNAPSHOT_SIZE_THRESHOLD = 25 * 1024; // 25KB threshold for snapshots
const SNAPSHOT_PREVIEW_LINES = 50; // Number of lines to preview
const TEMP_LOG_DIR = path.join(os.homedir(), '.cursor', 'browser-logs');

/**
 * Convert accessibility tree object to YAML-like format string
 */
function accessibilityTreeToYaml(node: any, indent = 0): string {
	const indentStr = '  '.repeat(indent);
	const lines: string[] = [];

	if (node.role) {
		lines.push(`${indentStr}- role: ${node.role}`);
	}
	if (node.name) {
		// Escape and format the name
		const name = String(node.name).replace(/\n/g, ' ').trim();
		if (name.includes(':') || name.includes('"') || name.includes('[')) {
			lines.push(`${indentStr}  name: "${name.replace(/"/g, '\\"')}"`);
		} else {
			lines.push(`${indentStr}  name: ${name}`);
		}
	}
	if (node.ref) {
		lines.push(`${indentStr}  ref: ${node.ref}`);
	}

	if (node.children && node.children.length > 0) {
		lines.push(`${indentStr}  children:`);
		for (const child of node.children) {
			lines.push(accessibilityTreeToYaml(child, indent + 2));
		}
	}

	return lines.join('\n');
}

/**
 * Writes a large snapshot to a file and returns a preview with file reference
 */
async function writeSnapshotToFile(
	snapshot: string
): Promise<{ filePath: string; previewLines: string[]; totalLines: number }> {
	await fs.mkdir(TEMP_LOG_DIR, { recursive: true });

	// Generate a unique filename for the snapshot file
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const fileName = `snapshot-${timestamp}.log`;
	const filePath = path.join(TEMP_LOG_DIR, fileName);

	// Calculate total lines and get preview lines
	const lines = snapshot.split('\n');
	const totalLines = lines.length;
	const previewLines = lines.slice(0, Math.min(SNAPSHOT_PREVIEW_LINES, totalLines));

	// Write the snapshot content to the file
	await fs.writeFile(filePath, snapshot, 'utf8');

	CursorIDEBrowserLogger.info(
		`Large snapshot redirected to: ${filePath} (${totalLines} lines, ${previewLines.length} preview lines)`
	);

	return { filePath, previewLines, totalLines };
}

/**
 * Utility functions for building accessibility snapshots and interacting with browser pages
 */
const BROWSER_UTILS = `
function buildPageSnapshot(depth = 0, maxDepth = 20) {
    function getTextFromIds(ids) {
        try {
            if (!ids) return '';
            const parts = [];
            ids.split(/\s+/).forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    const t = (el.innerText || el.textContent || '').trim();
                    if (t) parts.push(t);
                }
            });
            return parts.join(' ').trim();
        } catch (_) { return ''; }
    }

    function getVisibleText(el) {
        try {
            const walker = document.createTreeWalker(
                el,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(node) {
                        if (!node.textContent || !node.textContent.trim()) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        const parent = node.parentElement;
                        if (parent) {
                            const style = window.getComputedStyle(parent);
                            if (style && (style.visibility === 'hidden' || style.display === 'none')) {
                                return NodeFilter.FILTER_REJECT;
                            }
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );
            const parts = [];
            while (walker.nextNode()) {
                const text = walker.currentNode.textContent || '';
                const clean = text.replace(/\s+/g, ' ').trim();
                if (clean) {
                    parts.push(clean);
                    if (parts.join(' ').length > 240) {
                        break;
                    }
                }
            }
            if (parts.length) {
                return parts.join(' ').trim().substring(0, 200);
            }
            const fallback = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
            return fallback.substring(0, 200);
        } catch (_) {
            try {
                const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
                return text.substring(0, 200);
            } catch (_) {
                return '';
            }
        }
    }

    function getLabelsText(el) {
        try {
            const labels = (el.labels && Array.from(el.labels)) || [];
            if (!labels.length) return '';
            const labelText = labels
                .map(label => getVisibleText(label) || (label.textContent || '').trim())
                .filter(Boolean)
                .join(' ')
                .trim();
            return labelText.substring(0, 200);
        } catch (_) {
            return '';
        }
    }

    function getImplicitRole(el) {
        try {
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            switch (tag) {
                case 'a':
                    return el.hasAttribute('href') ? 'link' : 'generic';
                case 'button':
                    return 'button';
                case 'input': {
                    const type = (el.getAttribute('type') || 'text').toLowerCase();
                    switch (type) {
                        case 'button':
                        case 'submit':
                        case 'reset':
                            return 'button';
                        case 'checkbox':
                            return 'checkbox';
                        case 'radio':
                            return 'radio';
                        case 'range':
                            return 'slider';
                        case 'number':
                            return 'spinbutton';
                        default:
                            return 'textbox';
                    }
                }
                case 'select':
                    return el.hasAttribute('multiple') || Number(el.getAttribute('size') || 0) > 1 ? 'listbox' : 'combobox';
                case 'option':
                    return 'option';
                case 'textarea':
                    return 'textbox';
                case 'img':
                    return 'img';
                case 'ul':
                case 'ol':
                    return 'list';
                case 'li':
                    return 'listitem';
                case 'nav':
                    return 'navigation';
                case 'main':
                    return 'main';
                case 'header':
                    return 'banner';
                case 'footer':
                    return 'contentinfo';
                case 'form':
                    return 'form';
                case 'table':
                    return 'table';
                case 'tr':
                    return 'row';
                case 'td':
                    return 'cell';
                case 'th':
                    return 'columnheader';
                case 'section':
                case 'article':
                case 'aside':
                    return tag;
                case 'summary':
                    return 'button';
                case 'details':
                    return 'group';
                case 'progress':
                    return 'progressbar';
                case 'meter':
                    return 'meter';
                case 'label':
                    return 'label';
                case 'h1':
                case 'h2':
                case 'h3':
                case 'h4':
                case 'h5':
                case 'h6':
                    return 'heading';
                case 'svg':
                    return 'img';
                default:
                    return 'generic';
            }
        } catch (_) {
            return 'generic';
        }
    }

    function computeAccessibleName(el, role) {
        try {
            if (!el || el.getAttribute('aria-hidden') === 'true') {
                return '';
            }

            const labelledBy = el.getAttribute('aria-labelledby');
            const fromLabelledBy = getTextFromIds(labelledBy);
            if (fromLabelledBy) return fromLabelledBy.substring(0, 200);

            const ariaLabel = (el.getAttribute('aria-label') || '').trim();
            if (ariaLabel) return ariaLabel.substring(0, 200);

            const ariaPlaceholder = (el.getAttribute('aria-placeholder') || '').trim();
            if (ariaPlaceholder) return ariaPlaceholder.substring(0, 200);

            const labelsText = getLabelsText(el);
            if (labelsText) return labelsText.substring(0, 200);

            const tag = el.tagName ? el.tagName.toLowerCase() : '';

            if (tag === 'img') {
                const alt = (el.getAttribute('alt') || '').trim();
                if (alt) return alt.substring(0, 200);
            }

            if (tag === 'input') {
                const type = (el.getAttribute('type') || 'text').toLowerCase();
                const value = el.value || el.getAttribute('value') || '';
                const placeholder = (el.getAttribute('placeholder') || '').trim();
                if (type === 'button' || type === 'submit' || type === 'reset') {
                    if (value) return String(value).substring(0, 200);
                }
                if (placeholder) return placeholder.substring(0, 200);
                if (value && type !== 'password') return String(value).substring(0, 200);
            }

            if (tag === 'textarea') {
                const placeholder = (el.getAttribute('placeholder') || '').trim();
                if (placeholder) return placeholder.substring(0, 200);
                if (el.value) return String(el.value).substring(0, 200);
            }

            if (tag === 'select') {
                const selected = Array.from(el.selectedOptions || [])
                    .map(option => getVisibleText(option) || (option.textContent || '').trim())
                    .filter(Boolean)
                    .join(', ')
                    .trim();
                if (selected) return selected.substring(0, 200);
            }

            const roleLower = (role || '').toLowerCase();
            const interactiveRoles = new Set(['button', 'link', 'menuitem', 'option', 'tab', 'checkbox', 'radio', 'switch', 'combobox', 'textbox', 'listbox', 'slider', 'spinbutton', 'cell', 'gridcell', 'row', 'columnheader', 'rowheader']);
            const interactiveTags = new Set(['button', 'a', 'summary', 'label', 'option', 'textarea', 'select', 'time']);
            const headingTags = new Set(['h1','h2','h3','h4','h5','h6']);
            if (interactiveRoles.has(roleLower) || interactiveTags.has(tag) || headingTags.has(tag)) {
                const visible = getVisibleText(el);
                if (visible) return visible.substring(0, 200);
            }

            if (tag === 'p' || tag === 'li' || roleLower === 'heading') {
                const visible = getVisibleText(el);
                if (visible) return visible.substring(0, 200);
            }

            const title = (el.getAttribute('title') || '').trim();
            if (title) return title.substring(0, 200);

            return '';
        } catch (_) {
            return '';
        }
    }

    function collectElementStates(el, role) {
        const states = [];
        try {
            if (document.activeElement === el) states.push('focused');
            if (el.matches && el.matches(':checked')) states.push('checked');
            if (el.matches && el.matches(':disabled')) states.push('disabled');
            if (el.matches && el.matches(':required')) states.push('required');
            if (el.matches && el.matches(':read-only')) states.push('readonly');
            if (el.selected) states.push('selected');
            const ariaSelected = el.getAttribute('aria-selected');
            if (ariaSelected === 'true') states.push('selected');
            const ariaExpanded = el.getAttribute('aria-expanded');
            if (ariaExpanded === 'true') states.push('expanded');
            if (ariaExpanded === 'false') states.push('collapsed');
            const ariaPressed = el.getAttribute('aria-pressed');
            if (ariaPressed === 'true') states.push('pressed');
            if (ariaPressed === 'false') states.push('released');
            if (el.getAttribute && el.getAttribute('aria-current')) states.push('current');
            if (el.getAttribute && el.getAttribute('aria-invalid') === 'true') states.push('invalid');
            if (el.getAttribute && el.getAttribute('aria-busy') === 'true') states.push('busy');
        } catch (_) { }
        return Array.from(new Set(states));
    }

    function collectElementDetails(el, role) {
        const details = {};
        try {
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            const ariaDescription = (el.getAttribute('aria-description') || '').trim();
            if (ariaDescription) {
                details.description = ariaDescription.substring(0, 200);
            }
            const describedBy = getTextFromIds(el.getAttribute('aria-describedby'));
            if (describedBy) {
                details.description = details.description
                    ? (details.description + ' ' + describedBy.substring(0, 200)).trim()
                    : describedBy.substring(0, 200);
            }
            if (tag === 'a' && el.hasAttribute('href')) {
                details.url = el.getAttribute('href');
            }
            if ((tag === 'img' || tag === 'svg') && el.hasAttribute('src')) {
                details.src = el.getAttribute('src');
            }
            if (tag === 'input' || tag === 'textarea') {
                const type = (el.getAttribute('type') || 'text').toLowerCase();
                const value = el.value || el.getAttribute('value') || '';
                if (value && (tag !== 'input' || type !== 'password')) {
                    details.value = String(value).substring(0, 200);
                }
                const placeholder = (el.getAttribute('placeholder') || '').trim();
                if (placeholder) {
                    details.placeholder = placeholder.substring(0, 200);
                }
            }
            if (tag === 'select') {
                const selected = Array.from(el.selectedOptions || [])
                    .map(option => getVisibleText(option) || (option.textContent || '').trim())
                    .filter(Boolean);
                if (selected.length) {
                    details.value = selected.join(', ').substring(0, 200);
                }
            }
            if (role === 'combobox' && el.getAttribute('aria-activedescendant')) {
                details.activeDescendant = el.getAttribute('aria-activedescendant');
            }
        } catch (_) { }
        return details;
    }

    function shouldIncludeElement(el) {
        try {
            if (!el || el.getAttribute('aria-hidden') === 'true') {
                return false;
            }
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            const role = el.getAttribute('role') || getImplicitRole(el);
            const meaningfulTags = new Set(['a', 'button', 'input', 'select', 'textarea', 'img', 'svg', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'nav', 'main', 'header', 'footer', 'section', 'article', 'form', 'label', 'ul', 'ol', 'li', 'p', 'strong', 'em', 'small', 'time', 'option', 'summary', 'details']);
            if (meaningfulTags.has(tag)) {
                return true;
            }
            if (role && role !== 'generic') {
                return true;
            }
            if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) {
                return true;
            }
            if (el.matches && el.matches('[contenteditable="true"]')) {
                return true;
            }
            if (el.querySelector && el.querySelector('a, button, input, select, textarea, [role], [contenteditable="true"]')) {
                return true;
            }
        } catch (_) {
            return true;
        }
        return false;
    }

    function buildAccessibilityTree(element, depth = 0, maxDepth = 20) {
        if (!element || depth > maxDepth) return null;

        let ref = element.getAttribute && element.getAttribute('data-cursor-ref');
        if (!ref && element.setAttribute) {
            ref = 'ref-' + Math.random().toString(36).substring(2, 15);
            element.setAttribute('data-cursor-ref', ref);
        }

        const tag = element.tagName ? element.tagName.toLowerCase() : 'generic';
        const roleAttr = (element.getAttribute && element.getAttribute('role')) || '';
        const implicitRole = getImplicitRole(element);
        const role = (roleAttr || implicitRole || tag || 'generic');
        const name = computeAccessibleName(element, role);

        const node = {
            ref,
            role,
            name,
            tag,
            children: []
        };

        if (role === 'heading') {
            const ariaLevel = parseInt(element.getAttribute('aria-level') || '', 10);
            const tagLevelMatch = tag.match(/^h([1-6])$/);
            const tagLevel = tagLevelMatch ? parseInt(tagLevelMatch[1], 10) : undefined;
            const level = !Number.isNaN(ariaLevel) ? ariaLevel : tagLevel;
            if (level) {
                node.level = level;
            }
        }

        const states = collectElementStates(element, role);
        if (states.length) {
            node.states = states;
        }

        const details = collectElementDetails(element, role);
        for (const key in details) {
            if (Object.prototype.hasOwnProperty.call(details, key) && details[key] !== undefined && details[key] !== '') {
                node[key] = details[key];
            }
        }

        const children = [];
        if (element.children) {
            for (const child of Array.from(element.children)) {
                if (!shouldIncludeElement(child)) {
                    continue;
                }
                const childNode = buildAccessibilityTree(child, depth + 1, maxDepth);
                if (childNode) {
                    children.push(childNode);
                }
            }
        }

        node.children = children;
        return node;
    }

    return buildAccessibilityTree(document.body, depth, maxDepth);
}
`;

/**
 * Execute JavaScript in the browser view
 */
async function executeInBrowser(code: string): Promise<unknown> {
	try {
		return await vscode.commands.executeCommand('cursor.browserView.executeJavaScript', code);
	} catch (error) {
		CursorIDEBrowserLogger.error('Failed to execute JavaScript in browser:', error);
		throw error;
	}
}

/**
 * Browser tool implementations using direct JavaScript execution
 */
export const BrowserTools = {
	async navigate(params: { url: string }): Promise<unknown> {
		CursorIDEBrowserLogger.info(`Navigating to ${params.url}`);
		await vscode.commands.executeCommand('workbench.action.openBrowserEditor', {
			preserveFocus: true,
			url: params.url,
		});
		// Wait for page to load and return snapshot
		await new Promise(resolve => setTimeout(resolve, 1000));
		return await BrowserTools.snapshot({});
	},

	async snapshot(_params: Record<string, unknown>): Promise<unknown> {
		const code = `
			${BROWSER_UTILS}
			(function() {
				const tree = buildPageSnapshot();
				return {
					action: 'snapshot',
					success: true,
					pageState: {
						url: window.location.href,
						title: document.title,
						snapshot: tree
					}
				};
			})();
		`;
		const result = await executeInBrowser(code) as any;

		// Check if the snapshot is large and should be written to a file
		if (result?.pageState?.snapshot) {
			// Convert the accessibility tree object to YAML format string
			const ariaSnapshot = accessibilityTreeToYaml(result.pageState.snapshot);
			const url = result.pageState.url;
			const title = result.pageState.title;

			// Check if snapshot is too large and should be written to file
			const snapshotSize = Buffer.byteLength(ariaSnapshot, 'utf8');
			if (snapshotSize > SNAPSHOT_SIZE_THRESHOLD) {
				try {
					const { filePath, previewLines, totalLines } = await writeSnapshotToFile(ariaSnapshot);

					// Return text-based result with file reference instead of full snapshot
					const textParts: string[] = [];
					textParts.push(
						`\n\n### Page state`,
						`- Page URL: ${url}`,
						`- Page Title: ${title}`,
						`- Page Snapshot: Large snapshot (${snapshotSize} bytes, ${totalLines} lines) written to file`,
						`- Snapshot File: [${filePath}](file://${filePath})`,
						`- Preview (first ${previewLines.length} lines):`,
						'```yaml',
						previewLines.join('\n'),
						'```',
						`\n... (${totalLines - previewLines.length} more lines in file)`
					);

					return {
						action: 'snapshot',
						success: true,
						content: [{ type: 'text', text: textParts.join('\n') }]
					};
				} catch (error) {
					CursorIDEBrowserLogger.error('Failed to write snapshot to file, returning inline:', error);
					// Fall back to returning the full snapshot inline
				}
			}

			// Return inline snapshot for small snapshots or fallback
			const textParts: string[] = [];
			textParts.push(
				`\n\n### Page state`,
				`- Page URL: ${url}`,
				`- Page Title: ${title}`,
				`- Page Snapshot:`,
				'```yaml',
				ariaSnapshot,
				'```'
			);

			return {
				action: 'snapshot',
				success: true,
				content: [{ type: 'text', text: textParts.join('\n') }]
			};
		}

		return result;
	},

	async click(params: { ref: string; element?: string; doubleClick?: boolean; button?: string; modifiers?: string[] }): Promise<unknown> {
		const code = `
			${BROWSER_UTILS}
			(function() {
				const ref = ${JSON.stringify(params.ref)};
				const element = document.querySelector('[data-cursor-ref="' + ref + '"]');
				if (!element) throw new Error('Element not found');

				const rect = element.getBoundingClientRect();
				const cx = Math.round(rect.left + rect.width / 2);
				const cy = Math.round(rect.top + rect.height / 2);

				// Scroll into view if needed
				if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight || rect.right > window.innerWidth) {
					element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
				}

				const buttonValue = ${JSON.stringify(params.button)} === 'right' ? 2 :
					${JSON.stringify(params.button)} === 'middle' ? 1 : 0;

				const modifiers = ${JSON.stringify(params.modifiers || [])};
				const mouseEventOptions = {
					bubbles: true,
					cancelable: true,
					view: window,
					button: buttonValue,
					buttons: 1 << buttonValue,
					ctrlKey: modifiers.includes('Control') || modifiers.includes('ControlOrMeta'),
					shiftKey: modifiers.includes('Shift'),
					altKey: modifiers.includes('Alt'),
					metaKey: modifiers.includes('Meta') || modifiers.includes('ControlOrMeta'),
					clientX: cx,
					clientY: cy
				};

				if (element.focus) element.focus();

				element.dispatchEvent(new MouseEvent('mousedown', mouseEventOptions));
				element.dispatchEvent(new MouseEvent('mouseup', mouseEventOptions));
				element.dispatchEvent(new MouseEvent('click', mouseEventOptions));

				if (${JSON.stringify(params.doubleClick)}) {
					element.dispatchEvent(new MouseEvent('mousedown', mouseEventOptions));
					element.dispatchEvent(new MouseEvent('mouseup', mouseEventOptions));
					element.dispatchEvent(new MouseEvent('click', mouseEventOptions));
					element.dispatchEvent(new MouseEvent('dblclick', mouseEventOptions));
				}

				const snapshot = buildPageSnapshot();
				return {
					action: 'click',
					success: true,
					details: {
						doubleClick: ${JSON.stringify(params.doubleClick)} || false,
						button: ${JSON.stringify(params.button)} || 'left'
					},
					pageState: {
						url: window.location.href,
						title: document.title,
						snapshot: snapshot
					}
				};
			})();
		`;
		return await executeInBrowser(code);
	},

	async type(params: { ref: string; text: string; element?: string; submit?: boolean; slowly?: boolean }): Promise<unknown> {
		const code = `
			${BROWSER_UTILS}
			(function() {
				const ref = ${JSON.stringify(params.ref)};
				const element = document.querySelector('[data-cursor-ref="' + ref + '"]');
				if (!element) throw new Error('Element not found');

				element.focus();
				const text = ${JSON.stringify(params.text)};
				const slowly = ${JSON.stringify(params.slowly)} || false;
				const submit = ${JSON.stringify(params.submit)} || false;

				const isContentEditable = element.isContentEditable;

				if (slowly) {
					// Type one character at a time
					const delay = 50;
					for (let i = 0; i < text.length; i++) {
						const char = text[i];
						if (isContentEditable) {
							const selection = window.getSelection();
							const range = document.createRange();
							range.selectNodeContents(element);
							range.collapse(false);
							selection.removeAllRanges();
							selection.addRange(range);
							document.execCommand('insertText', false, char);
						} else {
							element.value = text.substring(0, i + 1);
						}
						element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true }));
						element.dispatchEvent(new Event('input', { bubbles: true }));
						element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true }));
						// Small delay between characters
						const startTime = Date.now();
						while (Date.now() - startTime < delay) { /* busy wait */ }
					}
				} else {
					if (isContentEditable) {
						element.textContent = text;
					} else {
						element.value = text;
					}
					element.dispatchEvent(new Event('input', { bubbles: true }));
				}

				element.dispatchEvent(new Event('change', { bubbles: true }));

				if (submit) {
					element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, code: 'Enter', which: 13, bubbles: true, cancelable: true }));
					element.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', keyCode: 13, code: 'Enter', which: 13, bubbles: true, cancelable: true }));
					element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, code: 'Enter', which: 13, bubbles: true, cancelable: true }));
				}

				const snapshot = buildPageSnapshot();
				return {
					action: 'type',
					success: true,
					details: { slowly, submitted: submit },
					pageState: {
						url: window.location.href,
						title: document.title,
						snapshot: snapshot
					}
				};
			})();
		`;
		return await executeInBrowser(code);
	},

	async hover(params: { ref: string; element?: string }): Promise<unknown> {
		const code = `
			${BROWSER_UTILS}
			(function() {
				const ref = ${JSON.stringify(params.ref)};
				const element = document.querySelector('[data-cursor-ref="' + ref + '"]');
				if (!element) throw new Error('Element not found');

				const rect = element.getBoundingClientRect();
				const hx = Math.round(rect.left + rect.width / 2);
				const hy = Math.round(rect.top + rect.height / 2);

				const mouseEventOptions = {
					bubbles: true,
					cancelable: true,
					view: window
				};

				element.dispatchEvent(new MouseEvent('mouseenter', { ...mouseEventOptions, clientX: hx, clientY: hy }));
				element.dispatchEvent(new MouseEvent('mouseover', { ...mouseEventOptions, clientX: hx, clientY: hy }));
				element.dispatchEvent(new MouseEvent('mousemove', { ...mouseEventOptions, clientX: hx, clientY: hy }));

				const snapshot = buildPageSnapshot();
				return {
					action: 'hover',
					success: true,
					pageState: {
						url: window.location.href,
						title: document.title,
						snapshot: snapshot
					}
				};
			})();
		`;
		return await executeInBrowser(code);
	},

	async selectOption(params: { ref: string; values: string[]; element?: string }): Promise<unknown> {
		const code = `
			${BROWSER_UTILS}
			(function() {
				const ref = ${JSON.stringify(params.ref)};
				const element = document.querySelector('[data-cursor-ref="' + ref + '"]');
				if (!element) throw new Error('Element not found');

				const selectElement = element;
				const values = ${JSON.stringify(params.values)};

				if (!selectElement.multiple) {
					selectElement.value = '';
				} else {
					Array.from(selectElement.options).forEach(option => {
						option.selected = false;
					});
				}

				const selectedValues = [];
				for (const value of values) {
					let optionFound = false;
					for (const option of selectElement.options) {
						if (option.value === value) {
							option.selected = true;
							selectedValues.push(value);
							optionFound = true;
							break;
						}
					}
					if (!optionFound) {
						throw new Error('Option with value "' + value + '" not found');
					}
				}

				selectElement.dispatchEvent(new Event('input', { bubbles: true }));
				selectElement.dispatchEvent(new Event('change', { bubbles: true }));

				const snapshot = buildPageSnapshot();
				return {
					action: 'select_option',
					success: true,
					details: { selectedValues },
					pageState: {
						url: window.location.href,
						title: document.title,
						snapshot: snapshot
					}
				};
			})();
		`;
		return await executeInBrowser(code);
	},

	async pressKey(params: { key: string }): Promise<unknown> {
		const code = `
			(function() {
				const key = ${JSON.stringify(params.key)};
				const activeElement = document.activeElement || document.body;

				activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
				activeElement.dispatchEvent(new KeyboardEvent('keypress', { key, bubbles: true, cancelable: true }));
				activeElement.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));

				return { action: 'press_key', success: true, key };
			})();
		`;
		return await executeInBrowser(code);
	},

	async waitFor(params: { time?: number; text?: string; textGone?: string }): Promise<unknown> {
		if (params.time !== undefined) {
			await new Promise(resolve => setTimeout(resolve, params.time! * 1000));
			return { action: 'wait_for', success: true, type: 'time', duration: params.time };
		}

		const code = `
			(function() {
				const targetText = ${JSON.stringify(params.text || params.textGone)};
				const waitForDisappear = ${JSON.stringify(!!params.textGone)};
				const timeout = 30000;
				const startTime = Date.now();

				return new Promise((resolve) => {
					const checkInterval = setInterval(() => {
						const bodyText = document.body.innerText || document.body.textContent || '';
						const found = bodyText.includes(targetText);

						if (waitForDisappear ? !found : found) {
							clearInterval(checkInterval);
							resolve({
								action: 'wait_for',
								success: true,
								type: waitForDisappear ? 'text_gone' : 'text_appear',
								text: targetText
							});
						}

						if (Date.now() - startTime > timeout) {
							clearInterval(checkInterval);
							resolve({
								action: 'wait_for',
								success: false,
								error: 'Timeout waiting for text',
								type: waitForDisappear ? 'text_gone' : 'text_appear',
								text: targetText
							});
						}
					}, 500);
				});
			})();
		`;
		return await executeInBrowser(code);
	},

	async consoleMessages(_params: Record<string, unknown>): Promise<unknown> {
		// Console logs are now tracked by the main process
		const logs = await vscode.commands.executeCommand<Array<{ type: string; message: string; timestamp: number }>>('cursor.browserView.getConsoleLogs');
		return {
			action: 'console_messages',
			success: true,
			messages: logs
		};
	},

	async networkRequests(_params: Record<string, unknown>): Promise<unknown> {
		// Network requests are now tracked by the main process
		const requests = await vscode.commands.executeCommand<Array<{
			url: string;
			method: string;
			statusCode?: number;
			timestamp: number;
			resourceType?: string;
		}>>('cursor.browserView.getNetworkRequests');
		return {
			action: 'network_requests',
			success: true,
			requests
		};
	},

	async takeScreenshot(params: { filename?: string; type?: string; fullPage?: boolean; element?: string; ref?: string }): Promise<unknown> {
		// Screenshot will be handled by the main process
		return await vscode.commands.executeCommand('cursor.browserView.takeScreenshot', params);
	},

	async goBack(_params: Record<string, unknown>): Promise<unknown> {
		return await vscode.commands.executeCommand('cursor.browserView.goBack');
	},

	async resize(params: { width: number; height: number }): Promise<unknown> {
		return await vscode.commands.executeCommand('cursor.browserView.resize', params);
	}
};

