#!/usr/bin/env python3
"""Generate TypeScript constants.ts file for all published models."""

import json
import re
from pathlib import Path
from typing import Dict, List

# Model categorization  
CATEGORY_INFO = {
    'immune-signaling': {
        'name': 'Immune Signaling',
        'description': 'Models of immune cell receptor signaling and innate immunity'
    },
    'growth-factor-signaling': {
        'name': 'Growth Factor Signaling',
        'description': 'Models of receptor tyrosine kinases and growth factor pathways'
    },
    'cell-regulation': {
        'name': 'Cell Regulation & Transport',
        'description': 'Models of cell signaling, nuclear transport, and developmental pathways'
    },
    'tutorials': {
        'name': 'Tutorials & Simple Examples',
        'description': 'Educational models and basic BNGL syntax examples'
    },
    'complex-models': {
        'name': 'Complex Published Models',
        'description': 'Advanced models from recent publications'
    },
    'test-models': {
        'name': 'Test Models',
        'description': 'Models generated for testing and demonstration'
    }
}

def extract_metadata(filepath: Path) -> Dict[str, str]:
    """Extract metadata from BNGL file comments."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read(2000)  # Read first 2000 chars for metadata
    
    # Try to find citation/author info in comments
    citation = None
    author_year = None
    
    # Look for patterns like "Faeder et al. (2003)" or "Barua, Faeder, and Haugh (2006)"
    cite_pattern = r'(?:by\s+)?([A-Z][a-z]+(?:\s+et\s+al\.)?(?:,\s+[A-Z][a-z]+)*)\s*\((\d{4})\)'
    match = re.search(cite_pattern, content)
    if match:
        author_year = f"{match.group(1)} ({match.group(2)})"
    
    # Check for explicit citation patterns
    if 'published in' in content.lower():
        cite_match = re.search(r'published in\s+([^\n]+)', content, re.IGNORECASE)
        if cite_match:
            citation = cite_match.group(1).strip()
    
    return {
        'citation': citation,
        'author_year': author_year
    }

def camel_case(s: str) -> str:
    """Convert filename to camelCase variable name."""
    # Remove .bngl, replace special chars with spaces
    s = s.replace('.bngl', '').replace('-', ' ').replace('_', ' ')
    # Split and capitalize
    parts = s.split()
    if not parts:
        return s
    return parts[0].lower() + ''.join(p.capitalize() for p in parts[1:])

def generate_constants_ts():
    """Generate the constants.ts file."""
    
    published_dir = Path('published-models')
    example_dir = Path('example-models')
    
    # Collect all models by category
    models_by_category = {}
    
    # Process published models (subdirectories)
    for category_dir in published_dir.iterdir():
        if not category_dir.is_dir():
            continue
        
        category = category_dir.name
        models = []
        
        for bngl_file in sorted(category_dir.glob('*.bngl')):
            metadata = extract_metadata(bngl_file)
            
            model_name = bngl_file.stem  # filename without extension
            var_name = camel_case(bngl_file.name)
            
            models.append({
                'filename': bngl_file.name,
                'model_name': model_name,
                'var_name': var_name,
                'path': str(bngl_file).replace('\\', '/'),
                'metadata': metadata
            })
        
        if models:
            models_by_category[category] = models

    # Process example models (flat directory)
    if example_dir.exists():
        category = 'test-models'
        models = []
        for bngl_file in sorted(example_dir.glob('*.bngl')):
            metadata = extract_metadata(bngl_file)
            
            model_name = bngl_file.stem
            var_name = camel_case(bngl_file.name)
            
            models.append({
                'filename': bngl_file.name,
                'model_name': model_name,
                'var_name': var_name,
                'path': str(bngl_file).replace('\\', '/'),
                'metadata': metadata
            })
        
        if models:
            models_by_category[category] = models
    
    # Generate TypeScript file
    lines = [
        "import { Example } from './types';",
        "",
        "// Published BNGL models from RulesRailRoad repository",
        "// Source: https://github.com/RulesRailRoad/RulesRailRoad.github.io/tree/gh-pages/models",
        ""
    ]
    
    # Generate imports
    for category, models in models_by_category.items():
        lines.append(f"// {CATEGORY_INFO[category]['name']}")
        for model in models:
            lines.append(f"import {model['var_name']} from './{model['path']}?raw';")
        lines.append("")
    
    # Chart colors
    lines.extend([
        "export const CHART_COLORS = [",
        "  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',",
        "  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'",
        "];",
        ""
    ])
    
    # Initial model (use simple.bngl if it exists, otherwise first model)
    simple_var = None
    for category, models in models_by_category.items():
        for model in models:
            if model['filename'] == 'simple.bngl':
                simple_var = model['var_name']
                break
        if simple_var:
            break
    
    if not simple_var:
        # Use first model
        first_category = list(models_by_category.keys())[0]
        simple_var = models_by_category[first_category][0]['var_name']
    
    lines.append(f"export const INITIAL_BNGL_CODE = {simple_var};")
    lines.append("")
    
    # Generate model arrays by category
    for category, models in models_by_category.items():
        cat_const_name = category.upper().replace('-', '_')
        lines.append(f"const {cat_const_name}: Example[] = [")
        
        for model in models:
            meta = model['metadata']
            display_name = model['model_name'].replace('_', ' ').replace('-', ' ')
            
            # Create description
            desc_parts = []
            if meta['author_year']:
                desc_parts.append(f"Model from {meta['author_year']}")
            if meta['citation']:
                desc_parts.append(meta['citation'])
            
            description = '. '.join(desc_parts) if desc_parts else f"BNGL model: {display_name}"
            
            tags = []
            if category == 'test-models':
                tags = ["'test model'"]
            else:
                tags = ["'published'", f"'{category.replace('-', ' ')}'"]
            
            lines.extend([
                "  {",
                f"    id: '{model['model_name']}',",
                f"    name: '{display_name}',",
                f"    description: '{description}',",
                f"    code: {model['var_name']},",
                f"    tags: [{', '.join(tags)}],",
                "  },",
            ])
        
        lines.append("];")
        lines.append("")
    
    # Create category structure
    lines.extend([
        "export interface ModelCategory {",
        "  id: string;",
        "  name: string;",
        "  description: string;",
        "  models: Example[];",
        "}",
        "",
        "export const MODEL_CATEGORIES: ModelCategory[] = ["
    ])
    
    for category in models_by_category.keys():
        cat_info = CATEGORY_INFO[category]
        cat_const_name = category.upper().replace('-', '_')
        lines.extend([
            "  {",
            f"    id: '{category}',",
            f"    name: '{cat_info['name']}',",
            f"    description: '{cat_info['description']}',",
            f"    models: {cat_const_name},",
            "  },",
        ])
    
    lines.extend([
        "];",
        "",
        "// Flat list of all models",
        "export const EXAMPLES: Example[] = MODEL_CATEGORIES.flatMap(cat => cat.models);",
        ""
    ])
    
    # Write file
    output_path = Path('constants.ts')
    with open(output_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    
    print(f"✅ Generated {output_path}")
    print(f"📊 {len(models_by_category)} categories, {sum(len(m) for m in models_by_category.values())} models total")

if __name__ == '__main__':
    generate_constants_ts()
