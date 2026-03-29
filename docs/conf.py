# docs/conf.py
# Configuration file for the Sphinx documentation builder.

# -- Project information -----------------------------------------------------

project = 'BioNetGen Playground'
copyright = '2026, RuleWorld Team'
author = 'RuleWorld Team'
release = '0.0.0'

# -- General configuration ---------------------------------------------------

extensions = [
    'myst_parser',           # Support for Markdown
    'sphinx_rtd_theme',      # Read the Docs theme
    'sphinx_copybutton',     # Add copy buttons to code blocks
    'sphinxcontrib.mermaid', # Render mermaid diagrams
]

templates_path = ['_templates']
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

# -- Options for HTML output -------------------------------------------------

html_theme = 'sphinx_rtd_theme'
html_static_path = ['_static']

# -- MyST Parser configuration -----------------------------------------------

myst_enable_extensions = [
    "colon_fence",    # ::: code blocks
    "deflist",        # Definition lists
    "dollarmath",     # $...$ and $$...$$
    "fieldlist",      # :key: value
    "html_admonition",# <div class="admonition">
    "html_image",     # <img src="...">
    "linkify",        # Auto-link URLs
    "replacements",   # (c) -> ©
    "smartquotes",    # "..." -> “...”
    "substitution",   # {{ var }}
    "tasklist",       # - [ ]
]

# Configure mermaid
mermaid_version = "" # Use latest
