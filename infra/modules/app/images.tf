data "aws_ecr_repository" "backend" {
  name = "meantime/backend"
}

data "aws_ecr_repository" "frontend" {
  name = "meantime/frontend"
}

data "aws_ecr_authorization_token" "this" {}

locals {
  backend_dir  = "${var.source_root}/backend"
  frontend_dir = "${var.source_root}/frontend"

  # Everything that goes into the backend image. Tests, caches and the
  # development Dockerfile don't, so changing them doesn't trigger a rebuild.
  backend_files = sort([
    for f in fileset(local.backend_dir, "**") : f
    if !can(regex("(^|/)(__pycache__|tests)/|\\.pyc$|^docker/Dockerfile$", f))
  ])

  # Listed explicitly so node_modules and .nuxt are never scanned. server/,
  # public/ and shared/ don't exist yet but are Nuxt folders someone may add.
  frontend_files = sort(setunion(
    fileset(local.frontend_dir, "{app,server,public,shared}/**"),
    fileset(local.frontend_dir, "docker/Dockerfile.prod"),
    fileset(local.frontend_dir, "{nuxt.config.ts,tailwind.config.ts,tsconfig.json,package.json,pnpm-lock.yaml,pnpm-workspace.yaml,.npmrc,.dockerignore}"),
  ))

  backend_tag = substr(sha1(join("", [
    for f in local.backend_files : "${f}:${filesha1("${local.backend_dir}/${f}")}"
  ])), 0, 12)

  frontend_tag = substr(sha1(join("", [
    for f in local.frontend_files : "${f}:${filesha1("${local.frontend_dir}/${f}")}"
  ])), 0, 12)

  backend_image  = "${data.aws_ecr_repository.backend.repository_url}:${local.backend_tag}"
  frontend_image = "${data.aws_ecr_repository.frontend.repository_url}:${local.frontend_tag}"

  registry          = split("/", data.aws_ecr_repository.backend.repository_url)[0]
  docker_config_dir = abspath("${path.root}/.terraform/docker-ecr")
}

# Private Docker config holding only the ECR login (no credential store), so
# `docker push` works on Windows. Refreshed on every apply; the token lasts 12 hours.
resource "local_sensitive_file" "docker_config" {
  filename        = "${local.docker_config_dir}/config.json"
  file_permission = "0600"
  content = jsonencode({
    auths = {
      (local.registry) = { auth = data.aws_ecr_authorization_token.this.authorization_token }
    }
  })
}

resource "terraform_data" "backend_image" {
  triggers_replace = [local.backend_image]

  provisioner "local-exec" {
    working_dir = local.backend_dir
    command     = "docker build --platform linux/amd64 -f docker/Dockerfile.prod -t ${local.backend_image} ."
  }

  provisioner "local-exec" {
    command = "docker push ${local.backend_image}"
    environment = {
      DOCKER_CONFIG = local.docker_config_dir
    }
  }

  depends_on = [local_sensitive_file.docker_config]
}

resource "terraform_data" "frontend_image" {
  triggers_replace = [local.frontend_image]

  provisioner "local-exec" {
    working_dir = local.frontend_dir
    command     = "docker build --platform linux/amd64 -f docker/Dockerfile.prod -t ${local.frontend_image} ."
  }

  provisioner "local-exec" {
    command = "docker push ${local.frontend_image}"
    environment = {
      DOCKER_CONFIG = local.docker_config_dir
    }
  }

  depends_on = [local_sensitive_file.docker_config]
}
