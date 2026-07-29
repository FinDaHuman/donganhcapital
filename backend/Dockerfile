# Use official Python runtime as a parent image.
# Must track the version the project targets (3.11) — Render deploys via the root
# Procfile, so drift here goes unnoticed until someone actually builds this image.
FROM python:3.11-slim

# Set the working directory in the container
WORKDIR /code

# Copy the requirements file into the container
COPY ./requirements.txt /code/requirements.txt

# Install packages
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the backend code
COPY . /code

# Expose port
EXPOSE 8000

# Command to run the app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
