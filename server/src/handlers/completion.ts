import { CompletionItem, CompletionItemKind, CompletionList, CompletionParams, InsertTextFormat, Position } from 'vscode-languageserver';
import { Range } from 'vscode-languageserver-textdocument';
import { getDocumentText, staticCompletionData } from '../server';

export const onCompletion = (params: CompletionParams): CompletionList => {
	const documentContent = getDocumentText(params.textDocument.uri);
	const currentLine = documentContent.split("\n")[params.position.line];
	const nextLine = documentContent.split("\n")[params.position.line + 1] ?? "";
	const lineUntilCursor = currentLine.slice(0, params.position.character);
	const currentWord = lineUntilCursor.split(/[\s,(]+/).pop() ?? '';

	const allCompletionItems: CompletionItem[] = [
		{
			label: "///",
			labelDetails: {
				description: "Doc comment block"
			},
			kind: CompletionItemKind.Snippet,
			insertText: getDocCommentSnippet(nextLine),
			insertTextFormat: InsertTextFormat.Snippet
		},
		...staticCompletionData,
	];

	const replaceStartPosition: Position = {
		line: params.position.line,
		character: lineUntilCursor.length - currentWord.length,
	};
	const preparedKnownItems = allCompletionItems.map(ki => {
		const range: Range = {
			start: replaceStartPosition,
			end: {
				...replaceStartPosition,
				character: replaceStartPosition.character + currentWord.length,
			},
		};

		return {
			...ki,
			// Replace preceding text, e.g. ClassName::, as well
			textEdit: {
				newText: ki.insertText ?? ki.label,
				insert: range,
				replace: range,
			}
		};
	});

	// Filter down list to only methods of current class, if contained by the current word.
	const filteredKnownItems = currentWord.includes('::') ?
		preparedKnownItems.filter(e => e.label.toLowerCase().startsWith(currentWord.toLowerCase()))
		: preparedKnownItems;

	return {
		isIncomplete: true,
		items: filteredKnownItems.slice(0, 1000),
	};
};

const getDocCommentSnippet = (nextLine: string): string => {
	const resultLines: string[] = [];

	const classParts = nextLine.split(/class[\s+]([a-zA-Z]+)[\s+]:[\s+]([a-zA-Z]+)/g);
	if (classParts.length > 1) {
		// consider it a class doc
		resultLines.push("///");
		resultLines.push("/// Class " + classParts[1]);
		resultLines.push("///");
		resultLines.push("/// Inherits from " + classParts[2]);
		resultLines.push("///");
		resultLines.push("/// ${1:Class documentation}.");
	} else {
		// consider it a method doc
		resultLines.push("/// ${1:Method documentation}");
		let placeholderIndex = 2;

		const methodParts = nextLine.split(/[\s+]([a-zA-Z0-9]+)[\s+][^\s^(]*\(([^)]*)\)/g);
		const returnType = methodParts[1];
		const params = methodParts[2] ? methodParts[2].split(",").map(p => p.trim()) : [];

		params.map(p => {
			const paramName = p.split(" ").pop()?.trim();
			resultLines.push(`/// @param ${paramName}: \${${placeholderIndex}:Parameter documentation}`);
			placeholderIndex++;
		});

		if (returnType !== "void") {
			resultLines.push(`/// @return \${${placeholderIndex}:Return value documentation}`);
		}
	}

	return resultLines.join("\n");
};