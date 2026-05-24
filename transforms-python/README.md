# Python Transforms in Foundry

## Overview

Python is the most comprehensive language for authoring data transformations from within Foundry. Python Transforms include support for batch and incremental pipelines, creating and sharing reusable code libraries, and defining data expectations to ensure high quality data pipelines.

To get started, open repo://transforms-python/src/myproject/datasets/examples.py and uncomment the example transform.

## Local Development

It is possible to carry out high-speed, iterative development of Python Transforms locally. To get started, click the "Work locally" button in the top right.

## Unit Testing

Unit testing is supported in Python transforms. Tests can be enabled by applying the `com.palantir.transforms.lang.pytest-defaults` Gradle plugin in the Python project repo://transforms-python/build.gradle file.

## Data Expectations

Data Expectations can be set up in a Python transforms repository. To get started, open the library search panel on the left side of your Code Repository, search for `transforms-expectations`, and click on "Add library" within the library tab.
