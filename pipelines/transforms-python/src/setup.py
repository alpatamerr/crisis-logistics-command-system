#!/usr/bin/env python
"""Python project setup script."""

import os
from setuptools import find_packages, setup

setup(
    name=os.environ["PKG_NAME"],
    version=os.environ["PKG_VERSION"],
    description="Python data transformation project",
    author="Crisis Logistics Command System",
    packages=find_packages(exclude=["contrib", "docs", "test"]),
    # Please specify your dependencies in conda_recipe/meta.yaml instead.
    install_requires=[],
    entry_points={"transforms.pipelines": ["root = myproject.pipeline:my_pipeline"]},
)
