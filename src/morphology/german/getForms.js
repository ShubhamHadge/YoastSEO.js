import { flattenDeep, uniq as unique } from "lodash-es";
import stem from "./stem";

/**
 * Checks whether a stemmed word is on the exception list for which we have full forms.
 *
 * @param {array} exceptionStems        The exception stems to check against.
 * @param {string} stemmedWordToCheck   The stem to check.
 *
 * @returns {Array<string>} The created word forms.
 */
const checkStemsFromExceptionList = function( exceptionStems, stemmedWordToCheck ) {
	for ( let i = 0; i < exceptionStems.length; i++ ) {
		const currentStemDataSet = exceptionStems[ i ];

		const stemPairToCheck = currentStemDataSet[ 0 ];

		for ( let j = 0; j < stemPairToCheck.length; j++ ) {
			const exceptionStemMatched = stemmedWordToCheck.endsWith( stemPairToCheck[ j ] );

			// Check if the stemmed word ends in one of the stems of the exception list.
			if ( exceptionStemMatched === true ) {
				// "Haupt".length = "Hauptstadt".length - "stadt".length
				const precedingLength = stemmedWordToCheck.length - stemPairToCheck[ j ].length;
				const precedingLexicalMaterial = stemmedWordToCheck.slice( 0, precedingLength );
				/*
			 	 * If the word is a compound, removing the final stem will result in some lexical material to
			 	 * be left over at the beginning of the word. For example, removing "stadt" from "Hauptstadt"
			 	 * leaves "Haupt". This lexical material is the base for the word forms that need to be created
			 	 * (e.g., "Hauptstädte").
			 	 */
				if ( precedingLexicalMaterial.length > 0 ) {
					const stemsToReturn = currentStemDataSet[ 1 ];
					return stemsToReturn.map( currentStem => precedingLexicalMaterial.concat( currentStem ) );
				}
				/*
				 * Return all possible stems since apparently the word that's being checked is equal to the stem on the
				 * exception list that's being checked.
				 */
				return currentStemDataSet[ 1 ];
			}
		}
	}

	return [];
};

/**
 * Checks whether a stemmed word has an ending for which we can predict possible suffix forms.
 *
 * @param {array} exceptionCategory     The exception category to check.
 * @param {string} stemmedWordToCheck   The stem to check.
 *
 * @returns {Array<string>} The created word forms.
 */
const checkStemsWithPredictableSuffixes = function( exceptionCategory, stemmedWordToCheck ) {
	// There are some exceptions to this rule. If the current stem falls into this category, the rule doesn't apply.
	const exceptionsToTheException = exceptionCategory[ 2 ];

	if ( exceptionsToTheException.some( ending => stemmedWordToCheck.endsWith( ending ) ) ) {
		return [];
	}

	const exceptionStems = exceptionCategory[ 0 ];

	// Return forms of stemmed word with appended suffixes.
	if ( exceptionStems.some( ending => stemmedWordToCheck.endsWith( ending ) ) ) {
		const suffixes = exceptionCategory[ 1 ];

		return suffixes.map( suffix => stemmedWordToCheck.concat( suffix ) );
	}

	return [];
};

/**
 * Checks whether a stemmed word is on any of the exception lists.
 *
 * @param {Object}  morphologyDataNouns The German morphology data for nouns.
 * @param {string}  stemmedWordToCheck  The stem to check.
 *
 * @returns {Array<string>} The created word forms.
 */
const checkExceptions = function( morphologyDataNouns, stemmedWordToCheck ) {
	// Check exceptions with full forms.
	let exceptions = checkStemsFromExceptionList( morphologyDataNouns.exceptionStemsWithFullForms, stemmedWordToCheck );

	if ( exceptions.length > 0 ) {
		return exceptions;
	}

	// Check exceptions with predictable suffixes.
	const exceptionsStemsPredictableSuffixes = morphologyDataNouns.exceptionsStemsPredictableSuffixes;

	for ( const key of Object.keys( exceptionsStemsPredictableSuffixes ) ) {
		exceptions = checkStemsWithPredictableSuffixes( exceptionsStemsPredictableSuffixes[ key ], stemmedWordToCheck );
		if ( exceptions.length > 0 ) {
			// For this class of words, the stemmed word is the singular form and therefore needs to be added.
			exceptions.push( stemmedWordToCheck );
			return exceptions;
		}
	}

	return exceptions;
};

/**
 * Adds suffixes to the list of regular suffixes.
 *
 * @param {Object}          morphologyDataSuffixAdditions   The German data for suffix additions.
 * @param {Array<string>}   regularSuffixes                 All regular suffixes for German.
 * @param {string}          stemmedWordToCheck              The stem to check.
 *
 * @returns {Array<string>} The modified list of regular suffixes.
 */
const addSuffixesToRegulars = function( morphologyDataSuffixAdditions, regularSuffixes, stemmedWordToCheck ) {
	for ( const key of Object.keys( morphologyDataSuffixAdditions ) ) {
		const endingsToCheck = morphologyDataSuffixAdditions[ key ][ 0 ];
		const suffixesToAdd = morphologyDataSuffixAdditions[ key ][ 1 ];

		// Append to the regular suffixes if one of the endings match.
		if ( endingsToCheck.some( ending => stemmedWordToCheck.endsWith( ending ) ) ) {
			regularSuffixes = regularSuffixes.concat( suffixesToAdd );
		}
	}

	return regularSuffixes;
};

/**
 * Deletes suffixes from the list of regular suffixes.
 *
 * @param {Object}          morphologyDataSuffixDeletions   The German data for suffix deletions.
 * @param {Array<string>}   regularSuffixes                 All regular suffixes for German.
 * @param {string}          stemmedWordToCheck              The stem to check.
 *
 * @returns {Array<string>} The modified list of regular suffixes.
 */
const removeSuffixesFromRegulars = function( morphologyDataSuffixDeletions, regularSuffixes, stemmedWordToCheck ) {
	for ( const key of Object.keys( morphologyDataSuffixDeletions ) ) {
		const endingsToCheck = morphologyDataSuffixDeletions[ key ][ 0 ];
		const suffixesToDelete = morphologyDataSuffixDeletions[ key ][ 1 ];

		// Delete from the regular suffixes if one of the endings match.
		if ( endingsToCheck.some( ending => stemmedWordToCheck.endsWith( ending ) ) ) {
			regularSuffixes = regularSuffixes.filter( ending => ! suffixesToDelete.includes( ending ) );
		}
	}

	return regularSuffixes;
};

/**
 * Adds or removes suffixes from the list of regulars depending on the ending of the stem checked.
 *
 * @param {Object}          morphologyDataNouns The German morphology data for nouns.
 * @param {Array<string>}   regularSuffixes     All regular suffixes for German.
 * @param {string}          stemmedWordToCheck  The stem to check.
 *
 * @returns {Array<string>} The modified list of regular suffixes.
 */
const modifyListOfRegularSuffixes = function( morphologyDataNouns, regularSuffixes, stemmedWordToCheck ) {
	const additions = morphologyDataNouns.regularSuffixAdditions;
	const deletions = morphologyDataNouns.regularSuffixDeletions;

	regularSuffixes = addSuffixesToRegulars( additions, regularSuffixes, stemmedWordToCheck );
	regularSuffixes = removeSuffixesFromRegulars( deletions, regularSuffixes, stemmedWordToCheck );

	return regularSuffixes;
};

/**
 * Add forms based on changes other than simple suffix concatenations.
 *
 * @param {Object}  morphologyDataNouns The German morphology data for nouns.
 * @param {string}  stemmedWordToCheck  The stem to check.
 *
 * @returns {Array<string>} The modified forms.
 */
const addFormsWithRemovedLetters = function( morphologyDataNouns, stemmedWordToCheck ) {
	const forms = [];
	const stemChanges = morphologyDataNouns.changeStem;

	for ( const key of Object.keys( stemChanges ) ) {
		const changeCategory = stemChanges[ key ];
		const endingToCheck = changeCategory[ 0 ];

		if ( stemmedWordToCheck.endsWith( endingToCheck ) ) {
			const stemWithoutEnding = stemmedWordToCheck.slice( 0, stemmedWordToCheck.length - endingToCheck.length );
			forms.push( stemWithoutEnding.concat( changeCategory[ 1 ] ) );
		}
	}

	return forms;
};

/**
 * Creates morphological forms for a given German word.
 *
 * @param {string} word             The word to create the forms for.
 * @param {Object} morphologyData   The German morphology data (false if unavailable).
 *
 * @returns {{forms: Array<string>, stem: string}} An object with the forms created and the stemmed word.
 */
export function getForms( word, morphologyData ) {
	const stemmedWord = stem( word );
	const forms = new Array( word );
	const exceptions = checkExceptions( morphologyData.nouns, stemmedWord );

	// Check exceptions.
	if ( exceptions.length > 0 ) {
		// Add the original word as a safeguard.
		exceptions.push( word );

		return { forms: unique( exceptions ), stem: stemmedWord };
	}

	let regularSuffixes = morphologyData.nouns.regularSuffixes.slice();
	// Depending on the specific ending of the stem, we can add/remove some suffixes from the list of regulars.
	regularSuffixes = modifyListOfRegularSuffixes( morphologyData.nouns, regularSuffixes, stemmedWord );

	// If the stem wasn't found on any exception list, add regular suffixes.
	forms.push( regularSuffixes.map( suffix => stemmedWord.concat( suffix ) ) );
	// Also add the stemmed word, since it might be a valid word form on its own.
	forms.push( stemmedWord );

	/*
	 * In some cases, we need make changes to the stem that aren't simply concatenations (e.g. remove n from the stem
	 * Ärztinn to obtain Ärztin.
	 */
	forms.push( addFormsWithRemovedLetters( morphologyData.nouns, stemmedWord ) );
	return { forms: unique( flattenDeep( forms ) ), stem: stemmedWord };
}
