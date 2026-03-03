export enum XMLErrorType {
  SYNTAX = 'syntax',
  STRUCTURE = 'structure',
  COMPATIBILITY = 'compatibility',
  SEMANTIC = 'semantic',
  CASE_SENSITIVITY = 'case-sensitivity',
  MISSING_REQUIRED_ATTRIBUTE = 'missing-required-attribute',
  SCHEMA_ERROR = 'schema-error'
}

export interface XMLValidationResult {
  isValid: boolean;
  valid: boolean;
  errors: Array<{
    type: XMLErrorType | string;
    message: string;
    element?: string;
    attribute?: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    type: string;
    message: string;
    severity: 'warning';
  }>;
}

export class XMLValidator {
  static validateBNGXML(xml: string): XMLValidationResult {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!xml || xml.trim() === '') {
      errors.push({ type: XMLErrorType.STRUCTURE, message: 'Empty XML', severity: 'error' });
      return { isValid: false, valid: false, errors, warnings };
    }

    // Case sensitivity for totalrate
    if (xml.indexOf('totalRate="') !== -1) {
        if (xml.indexOf('<model') !== -1 && xml.indexOf('<model') < xml.indexOf('totalRate="')) {
            errors.push({ 
                type: XMLErrorType.CASE_SENSITIVITY, 
                element: 'model',
                attribute: 'totalRate',
                message: 'BNG-XML requires lowercase "totalrate", found camelCase "totalRate"', 
                severity: 'error' 
            });
        }
        if (xml.indexOf('<RateLaw') !== -1) {
            errors.push({ 
                type: XMLErrorType.CASE_SENSITIVITY, 
                element: 'RateLaw',
                attribute: 'totalRate',
                message: 'BNG-XML requires lowercase "totalrate", found camelCase "totalRate"', 
                severity: 'error' 
            });
        }
    }

    // Missing totalrate attribute
    if (xml.indexOf('<model ') !== -1 && xml.indexOf('totalrate="') === -1 && xml.indexOf('totalRate="') === -1) {
        errors.push({
            type: XMLErrorType.MISSING_REQUIRED_ATTRIBUTE,
            element: 'model',
            attribute: 'totalrate',
            message: 'Model element missing totalrate attribute',
            severity: 'error'
        });
    }

    const rateLawMatches = xml.match(/<RateLaw[^>]*>/g);
    if (rateLawMatches) {
        rateLawMatches.forEach(rl => {
            if (rl.indexOf('totalrate="') === -1 && rl.indexOf('totalRate="') === -1) {
                errors.push({
                    type: XMLErrorType.MISSING_REQUIRED_ATTRIBUTE,
                    element: 'RateLaw',
                    attribute: 'totalrate',
                    message: 'RateLaw element missing totalrate attribute',
                    severity: 'error'
                });
            }
        });
    }

    // Missing required sections
    const requiredSections = [
        'ListOfParameters',
        'ListOfMoleculeTypes',
        'ListOfSpecies',
        'ListOfReactionRules',
        'ListOfObservables'
    ];
    requiredSections.forEach(section => {
        if (xml.indexOf('<' + section + '>') === -1 && xml.indexOf('<' + section + '/>') === -1 && xml.indexOf('<' + section + ' ') === -1) {
            errors.push({
                type: XMLErrorType.SCHEMA_ERROR,
                element: section,
                message: `Missing required section: ${section}`,
                severity: 'error'
            });
        }
    });

    // Missing closing tag for model
    if (xml.includes('<model') && !xml.includes('</model>') && !xml.includes('/>')) {
      errors.push({ 
        type: XMLErrorType.SYNTAX, 
        message: 'Missing block closing tag: model', 
        severity: 'error' 
      });
    }

    return {
      isValid: errors.length === 0,
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  static validateForNFsim(xml: string): XMLValidationResult {
    const result = this.validateBNGXML(xml);
    
    // Intramolecular detection
    if (xml.includes('intramolecular_rule') || xml.includes('<Bond')) {
        result.warnings.push({
            type: 'compatibility',
            message: 'Rules with intramolecular patterns detected. Ensure they match NFsim disjoint sets requirements.',
            severity: 'warning'
        });
    }

    // Complexity/UTL
    if (xml.includes('Component') && xml.split('Component').length > 10) {
        result.warnings.push({
            type: 'performance',
            message: 'High pattern complexity detected. Consider adjusting UTL if simulation hangs.',
            severity: 'warning'
        });
    }

    return result;
  }
}

