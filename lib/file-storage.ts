import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'projects');

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureProjectDir(projectId: string): Promise<string> {
  const projectDir = path.join(DATA_DIR, projectId);
  await ensureDir(projectDir);
  await ensureDir(path.join(projectDir, 'images'));
  await ensureDir(path.join(projectDir, 'videos'));
  return projectDir;
}

export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function deleteDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export async function listDirs(parentDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

export async function saveFile(filePath: string, data: Buffer): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, data);
}

export function getProjectDir(projectId: string): string {
  return path.join(DATA_DIR, projectId);
}

export function getProjectFilePath(projectId: string): string {
  return path.join(DATA_DIR, projectId, 'project.json');
}
